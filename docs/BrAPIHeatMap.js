(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('d3'), require('@turf/turf'), require('leaflet'), require('@solgenomics/brapijs')) :
  typeof define === 'function' && define.amd ? define(['d3', '@turf/turf', 'leaflet', '@solgenomics/brapijs'], factory) :
  (global.BrAPIHeatMap = factory(global.d3,global.turf,global.L,global.BrAPI));
}(this, (function (d3,turf,L,BrAPI) { 'use strict';

  d3 = d3 && d3.hasOwnProperty('default') ? d3['default'] : d3;
  turf = turf && turf.hasOwnProperty('default') ? turf['default'] : turf;
  L = L && L.hasOwnProperty('default') ? L['default'] : L;
  BrAPI = BrAPI && BrAPI.hasOwnProperty('default') ? BrAPI['default'] : BrAPI;

  function _redraw(HeatMap){
    
    HeatMap.prototype._redraw = function(){    
      var layout_data = d3.values(this.layout_data);
      this._redraw_obsUnits(layout_data);
      this._redraw_reps(layout_data);
      this._redraw_blocks(layout_data);

      // reposition SVG inside leaflet layer
      let padding = 1000;
      var bbox = this.content.node().getBBox();
      this.svg.attr("width", bbox.width + 2*padding)
        .attr("height", bbox.height + 2*padding)
        .style("left", bbox.x-padding + "px")
        .style("top", bbox.y-padding + "px");
      this.content.attr("transform", `translate(${-bbox.x+padding},${-bbox.y+padding})`);
    };
    
    HeatMap.prototype._redraw_controls = function(){
      var trait_observations = d3.values(this.layout_data).reduce((traits,obs)=>{
        obs.observations.forEach(ob=>{
          let t = ob.observationVariableDbId;
          if(!traits[t]) traits[t] = {name:ob.observationVariableName,count:0};
          traits[t].count+=1;
        });
        return traits;
      },{});
      var opts = this.controls.traits.selectAll("option").data(
        d3.entries(trait_observations)
      );
      opts.exit().remove();
      opts.enter().append("option").merge(opts)
        .attr("value",d=>d.key)
        .attr("selected",false)
        .text(d=>`${d.value.name} (${d.value.count} observations)`);
      this.controls.traits.append("option").lower()
        .text("Select a trait")
        .attr("disabled",true)
        .attr("selected",true);

    };
    
    HeatMap.prototype._redraw_scale = function(){
      let tickscale = d3.scaleLinear().domain([0,1]).range(this.colorscale.domain());
      let count = 5;
      let colors = [0,0.25,0.5,0.75,1].map(tickscale).map((d,i)=>({
        col:this.colorscale(d),
        val:(i==0||i==count-1)?d:""
      }));
      let blocks = this.controls.legend.selectAll(".HeatMap_legendBlock")
        .data([{col:"black",val:"--"}].concat(colors));
      blocks.exit().remove();
      let newBlocks = blocks.enter().append("g").classed("HeatMap_legendBlock",true);
      newBlocks.append("rect")
        .attr("x",(d,i)=>(40+2)*i).attr("y",0)
        .attr("width",40).attr("height",20);
      newBlocks.append("text")
        .attr("x",(d,i)=>(40+2)*i+20).attr("y",22)
        .attr("text-anchor","middle")
        .attr("alignment-baseline","hanging");
      newBlocks.merge(blocks).select("rect").attr("fill",d=>d.col);
      newBlocks.merge(blocks).select("text").text(d=>d.val);
      
    };

    HeatMap.prototype._redraw_obsUnits = function(layout_data){
      var units = this.obsUnits.selectAll(".HeatMap_obsUnit")
        .data(layout_data,d=>d.observationUnitDbId);
      var newUnits = units.enter().append("g")
        .classed("HeatMap_obsUnit",true)
        .style("pointer-events","visible")
        .on("mouseover", (d)=>this.focus_unit(d))
        .on("mouseout", (d)=>this.focus_unit(null));
      newUnits.append("path")
        .attr("stroke","none")
        .attr("stroke-width","0.25px")
        .attr("vector-effect","non-scaling-stroke")
        .style("pointer-events","visible");
      newUnits.append("text")
        .attr("text-anchor","middle")
        .attr("alignment-baseline","middle")
        .attr("fill","white")
        .text(obs=>obs.plotNumber)
        .style("pointer-events","visible");

      newUnits.merge(units)
        .select("path")
        .attr("fill",(obs)=>{
          // HeatMap color!
          console.log(this.controls._trait);
          if(this.controls._trait==undefined){
            // No selected trait!
            return "black"
          }
          return this.traitcolor(obs)
        })
        .attr("d",obs=>{
          return this.geoPath(this.shape_obsUnit(obs))
        });
      newUnits.merge(units).select("text")
        .attr("x",obs=>{
          var c = turf.centroid(this.shape_obsUnit(obs)).geometry.coordinates;
          return this.map.latLngToLayerPoint(new L.LatLng(c[1],c[0])).x
        })
        .attr("y",obs=>{
          var c = turf.centroid(this.shape_obsUnit(obs)).geometry.coordinates;
          return this.map.latLngToLayerPoint(new L.LatLng(c[1],c[0])).y
        })
        .attr("font-size",function(){
          return this.parentNode.getBBox().width/5;
        });
    };

    HeatMap.prototype._redraw_reps = function(layout_data){
      var reps = this.reps.selectAll(".HeatMap_rep")
        .data(d3.nest().key(d=>d.replicate).entries(layout_data),d=>d.key);
      reps.exit().remove();
      reps.enter().append("path").classed("HeatMap_rep",true)
        .attr("fill","none")
        .attr("stroke","red")
        .attr("stroke-width","4px")
        .attr("vector-effect","non-scaling-stroke")
      .merge(reps)
        .attr("d",d=>this.geoPath(this._rep_shapes[d.key]));  
    };

    HeatMap.prototype._redraw_blocks = function(layout_data){
      var blocks = this.blocks.selectAll(".HeatMap_block")
        .data(d3.nest().key(d=>d.blockNumber).entries(layout_data),d=>d.key);
      blocks.exit().remove();
      blocks.enter().append("path").classed("HeatMap_block",true)
        .attr("fill","none")
        .attr("stroke","white")
        .attr("stroke-width","1.5px")
        .attr("vector-effect","non-scaling-stroke")
      .merge(blocks)
        .attr("d",d=>this.geoPath(this._block_shapes[d.key]));
    };
  }

  function defaultPlot(HeatMap){
    HeatMap.prototype.defaultPlot_init = function(){
      this.opts.gridHeight = turf.distance(this.opts.defaultPos,turf.along(turf.lineString([this.opts.defaultPos,[this.opts.defaultPos[0],this.opts.defaultPos[1]-1]]),this.opts.gridDist*this.opts.gridSize),{'units':"degrees"})/this.opts.gridSize;
      this.opts.gridWidth = turf.distance(this.opts.defaultPos,turf.along(turf.lineString([this.opts.defaultPos,[this.opts.defaultPos[0]+1,this.opts.defaultPos[1]]]),this.opts.gridDist*this.opts.gridSize),{'units':"degrees"})/this.opts.gridSize;
      this.opts.plot_memo = Array(this.opts.gridSize*this.opts.gridSize);
    };
    
    HeatMap.prototype.defaultPlot = function(row,col){
      let top = this.opts.defaultPos[1] - this.opts.gridHeight * (row+1);
      let bottom = this.opts.defaultPos[1] - this.opts.gridHeight * row;
      let left = this.opts.defaultPos[0] + this.opts.gridWidth * col;
      let right = this.opts.defaultPos[0] + this.opts.gridWidth * (col+1);
      return this.opts.plot_memo[(row*this.opts.gridSize)+col]||
        (this.opts.plot_memo[(row*this.opts.gridSize)+col] = 
          turf.polygon([
          [[left,bottom], [right,bottom], [right,top], [left,top], [left,bottom]]
          ], {})
         ); 
    };
    
    HeatMap.prototype.defaultPlot_sort = function(a,b){
      if(a.blockNumber!=b.blockNumber){
        return parseFloat(a.blockNumber)>parseFloat(b.blockNumber)?1:-1;
      }
      if(a.replicate!=b.replicate){
        return parseFloat(a.replicate)>parseFloat(b.replicate)?1:-1;
      }
      if(a.plotNumber!=b.plotNumber){
        return parseFloat(a.plotNumber)>parseFloat(b.plotNumber)?1:-1
      }
      return 1;
    };
  }

  function focus(HeatMap){
    HeatMap.prototype.focus_unit = function(obs){
      var focus_block = obs?obs.blockNumber:null;
      var focus_rep = obs?obs.replicate:null;
      this.obsUnits.selectAll(".HeatMap_obsUnit")
        .classed("HeatMap_obsUnit-focus",false)
        .filter(d=>d==obs)
        .classed("HeatMap_obsUnit-focus",true)
        .raise();
      this.blocks.selectAll(".HeatMap_block")
        .classed("HeatMap_block-focus",false)
        .filter(d=>d.key==focus_block)
        .classed("HeatMap_block-focus",true)
        .raise();
      this.reps.selectAll(".HeatMap_rep")
        .classed("HeatMap_rep-focus",false)
        .filter(d=>d.key==focus_rep)
        .classed("HeatMap_rep-focus",true)
        .raise();
    };
  }

  function shape(HeatMap){
    HeatMap.prototype.shape_reshape = function(){
      this._obsUnit_shapes = {};
      var layout_data = d3.values(this.layout_data);
      if(layout_data.every(d=>!isNaN(d.X)&&!isNaN(d.Y))){
        // has coordinates
        if(layout_data.every(d=>d.X==Math.floor(d.X)&&d.Y==Math.floor(d.Y))){
          // all integers, col/row not lat/long
          layout_data.forEach(obs=>{
            console.log(obs.Y,obs.X);
            this._obsUnit_shapes[obs.observationUnitDbId] = this.defaultPlot(obs.Y,obs.X);
          });
        }
      }
      else {
        // position should be determined by block/rep
        // picks a field width that trys to the median block-length evenly
        var bllen = Math.round(d3.median(d3.nest().key(d=>d.blockNumber).entries(layout_data),n=>n.values.length));
        var squarelen = Math.sqrt(this._layout_size);
        var lyt_width;
        if(squarelen==bllen){
          lyt_width = squarelen;
        }
        else if (squarelen>bllen) {
          lyt_width = Math.round(squarelen/bllen)*bllen;
        }
        else {
          var closest_up = (bllen%squarelen)/Math.floor(bllen/squarelen);
          var closest_down = (squarelen-bllen%squarelen)/Math.ceil(bllen/squarelen);
          lyt_width = Math.round(
            closest_up<=closest_down? 
              squarelen+closest_up: 
              squarelen-closest_down
          );
        }
        layout_data.sort(this.defaultPlot_sort).forEach((d,pos)=>{
          var row = Math.floor(pos/lyt_width);
          var col = (pos%lyt_width);
          if (row%2==1) col = (lyt_width-1)-col;
          this._obsUnit_shapes[d.observationUnitDbId] = this.defaultPlot(row,col);
        });
      }
      this._rep_shapes = {};
      d3.nest().key(d=>d.replicate).entries(layout_data).forEach(d=>{
        this._rep_shapes[d.key] = this.shape_rep(d.key);
      });
      this._block_shapes = {};
      d3.nest().key(d=>d.blockNumber).entries(layout_data).forEach(d=>{
        this._block_shapes[d.key] = this.shape_block(d.key);
      });
      this.redraw();
      var bb = this.shape_bounds();
      this.map.fitBounds([[bb[1],bb[0]],[bb[3],bb[2]]]);
    };

    HeatMap.prototype.shape_obsUnit = function(obs){
      return this._obsUnit_shapes[obs.observationUnitDbId];
    };

    HeatMap.prototype.shape_bounds = function(){
      return turf.bbox(
        turf.featureCollection(
          d3.values(this._obsUnit_shapes)
        )
      );
    };

    HeatMap.prototype.shape_hullDist = function(feature_collection){
      var length = feature_collection.features.length;
      return Math.sqrt(turf.area(feature_collection)/length)/1000*1.5;
    };

    HeatMap.prototype.shape_concave_hull = function(obsUnits){
      var feature_collection = turf.featureCollection(
        obsUnits.map(obs=>this._obsUnit_shapes[obs.observationUnitDbId])
        .reduce((a,s)=>{
          a.push(s);
          a.push(turf.centroid(s));
          return a;
        },[])
      );
      return turf.concave(
        turf.explode(feature_collection),
        {maxEdge:this.shape_hullDist(feature_collection),units:'kilometers'}
      );
    };

    HeatMap.prototype.shape_block = function(bn){
      return this.shape_concave_hull(
        d3.values(this.layout_data).filter(d=>d.blockNumber==bn)
      );
    };

    HeatMap.prototype.shape_rep = function(rn){
      return this.shape_concave_hull(
        d3.values(this.layout_data).filter(d=>d.replicate==rn)
      );
    };
  }

  function startLoad(HeatMap){
    /**
     * Loads Phenotype/ObservationUnit Data via BrAPI
     */
    HeatMap.prototype.startLoad = function(){
      this.fieldLayout.classed("Heatmap_loading",true);
      this.layout_data = {};
      BrAPI("https://cassavabase.org/brapi/v1",null,"1.2")
        .phenotypes_search({
          "studyDbIds":[this.studyDbId],
          "observationLevel":"plot",
          'pageSize':100
        })
        .each(d=>{
          d.X = parseFloat(d.X);
          d.Y = parseFloat(d.Y);
          this.layout_data[d.observationUnitDbId] = d;
          this._layout_size = parseInt(d.__response.metadata.pagination.totalCount);
          this.reshape();
        })
        .all(()=>{
          this.fieldLayout.classed("Heatmap_loading",false);
          this._redraw_controls();
          console.log(this.layout_data);
        });
    };
  }

  function trait(HeatMap){
    HeatMap.prototype.trait_set = function(t){
      this.controls._trait = t;
      this.colorscale = d3.scaleSequential(d3.interpolateViridis);
      let trait_accessor = this.trait_accessor(t);
      this.colorscale.domain(
        d3.extent(
          d3.values(this.layout_data),
          trait_accessor
        )
      );
      this.traitcolor = obs=>{
        let val = trait_accessor(obs);
        if(val==undefined) return "black";
        return this.colorscale(val);
      };
      this._redraw_scale();
      this.redraw();
    };

    HeatMap.prototype.trait_accessor = function(t){
      return obs=>d3.mean(
        obs.observations.filter(ob=>ob.observationVariableDbId==t),
        ob=>ob.value
      );
    };
  }

  const DEFAULT_OPTS = {
    defaultPos: [-39.0863,-12.6773],
    gridSize: 500,
    gridDist: 0.002
  };

  class HeatMap {
    constructor(map_container,controls_container,studyDbId,opts) {
      this.map_container = d3.select(map_container);
      this.controls = {};
      this.controls.container = d3.select(controls_container);
      this.studyDbId = studyDbId;
      
      // Parse Options
      this.opts = Object.assign(Object.create(DEFAULT_OPTS),opts);
      
      // Create Default Plot Positions
      this.defaultPlot_init();

      // Set up debouncing
      this.reshape = debounceThrottle(()=>this.shape_reshape());
      this.redraw = debounceThrottle(()=>this._redraw());

      // Set up Leaflet Map
      this.map = L.map(this.map_container.node(),{zoomAnimation:false,zoomSnap:0.1});
      this.map.on('viewreset', ()=>this._redraw());
      this.map.on('resize', ()=>this._redraw());
      this.map.on('zoom', ()=>this._redraw());

      // Set up Map projection
      let thismap = this.map;
      let transform = d3.geoTransform({point: function(x, y){
        var point = thismap.latLngToLayerPoint(new L.LatLng(y, x));
        this.stream.point(point.x, point.y);
      }});
      this.geoPath = d3.geoPath().projection(transform);

      // Set up SVG overlay
      this.svg = d3.select(this.map.getPanes().overlayPane).append("svg")
        .style("top",0)
        .style("left",0);
      this.content = this.svg.append("g").attr("class", "leaflet-zoom-hide zoom-hide-transition");
      this.fieldLayout = this.content.classed("HeatMap_layout",true);
      this.obsUnits = this.fieldLayout.append("g").classed("HeatMap_obsUnits",true);
      this.reps = this.fieldLayout.append("g").classed("HeatMap_reps",true);
      this.blocks = this.fieldLayout.append("g").classed("HeatMap_blocks",true);

      // Set up the Controls
      this.controls.div = this.controls.container.append("div").classed("HeatMap_controls",true);
      this.controls.traits = this.controls.div.append("select").classed("HeatMap_trait_select",true);
      this.controls.traits.on("change",()=>{
        this.trait_set(this.controls.traits.node().value);
      });
      this.controls.legend = this.controls.div.append("svg")
        .attr("width", "100%")
        .attr("height", 50)
        .append("g")
        .attr("transform", "translate(0,10)");

      // Load Data
      this.layout_data = {};
      this.startLoad();
    }
  }
   _redraw(HeatMap);
   defaultPlot(HeatMap);
   focus(HeatMap);
   shape(HeatMap);
   startLoad(HeatMap);
   trait(HeatMap);

  function debounceThrottle(f){ //triggers f every 200ms while called within 25ms repeatedly
    var db;
    var th;
    return ()=>{
      clearTimeout(db);
      db = setTimeout(() => {
        clearTimeout(th);
        th = false;
        f();
      }, 25);
      if(!th){
        th = setTimeout(() => {
          clearTimeout(db);
          th = false;
          f();
        }, 200);
      }
    }
  }

  return HeatMap;

})));
