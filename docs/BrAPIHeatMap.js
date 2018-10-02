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
      this.resize();
    };
    
    HeatMap.prototype.resize = function(){
      // reposition SVG inside leaflet layer
      let padding = 1000;
      var bbox = this.zoomer.node().getBBox();
      this.svg.attr("width", bbox.width + 2*padding)
        .attr("height", bbox.height + 2*padding)
        .style("left", bbox.x-padding + "px")
        .style("top", bbox.y-padding + "px");
      this.zoomer.attr("transform", `translate(${-bbox.x+padding},${-bbox.y+padding})`);
    };
    
    HeatMap.prototype._redraw_controls = function(){
      if(!this.opts.draw_controls) return
      if(this.opts.draw_control_trait){
        this.controls.traits.style("display",null);
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
          .attr("disabled",null)
          .attr("selected",null)
          .text(d=>`${d.value.name} (${d.value.count} observations)`);
        this.controls.traits.append("option").lower()
          .text("Select a trait")
          .attr("disabled",true)
          .attr("selected",true);
      }
      else {
        this.controls.traits.style("display","none");
      }
      if(this.opts.draw_control_trait){
        this.controls.units.style("display",null);
      } else {
        this.controls.units.style("display","none");
      }

    };
    
    HeatMap.prototype._redraw_scale = function(){
      let tickscale = d3.scaleLinear().domain([0,1]).range(this.colorscale.domain());
      let count = 9;
      let colors = (this.controls._trait!=null?[0,0.125,0.25,0.375,0.5,0.625,0.75,0.875,1]:[])
        .map(tickscale).map((d,i)=>({
          col:this.colorscale(d),
          val:(i==0||i==count-1)?d:""
        })
      );
      let blocks = this.controls.legend.selectAll(".HeatMap_legendBlock")
        .data(colors);
      blocks.exit().remove();
      let newBlocks = blocks.enter().append("g").classed("HeatMap_legendBlock",true);
      newBlocks.append("rect")
        .attr("x",(d,i)=>(18+2)*i).attr("y",0)
        .attr("width",18).attr("height",20);
      newBlocks.append("text")
        .attr("x",(d,i)=>(18+2)*i+9).attr("y",22)
        .attr("text-anchor","middle")
        .attr("alignment-baseline","hanging");
      newBlocks.merge(blocks).select("rect").attr("fill",d=>d.col);
      newBlocks.merge(blocks).select("text").text(d=>d.val);
      
    };

    HeatMap.prototype._redraw_obsUnits = function(layout_data){
      var units = this.obsUnits.selectAll(".HeatMap_obsUnit")
        .data(layout_data,d=>d.observationUnitDbId);
      units.exit().remove();
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
        .text(obs=>(obs.plotNumber)+(obs.plantNumber?":"+obs.plantNumber:""))
        .style("pointer-events","visible");

      newUnits.merge(units)
        .select("path")
        .attr("fill",(obs)=>{
          // HeatMap color!
          if(this.controls._trait==undefined){
            // No selected trait!
            return "none"
          }
          return this.traitcolor(obs)
        })
        .attr("d",obs=>{
          return this.geoPath(this.shape_obsUnit(obs))
        });
      newUnits.merge(units).select("text")
        .attr("x",obs=>{
          return this.geoPath.centroid(this.shape_obsUnit(obs))[0]
        })
        .attr("y",obs=>{
          return this.geoPath.centroid(this.shape_obsUnit(obs))[1]
        })
        .attr("font-size",obs=>{
          var squareedge = Math.sqrt(this.geoPath.area(this.shape_obsUnit(obs)));
          return (squareedge/5) || 0;
        });
    };

    HeatMap.prototype._redraw_reps = function(layout_data){
      var reps = this.reps.selectAll(".HeatMap_rep")
        .data(d3.nest().key(d=>d.replicate).entries(layout_data),d=>d.key);
      reps.exit().remove();
      reps.enter().append("path").classed("HeatMap_rep",true)
        .attr("fill","none")
        .attr("stroke","blue")
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
      this.opts.shape_memo = Array(this.opts.gridSize*this.opts.gridSize);
      this.opts.subshape_memo = Array(this.opts.gridSize*this.opts.gridSize);
    };
    
    HeatMap.prototype.defaultPlot = function(row,col){
      if(!this.opts.shape_memo[(row*this.opts.gridSize)+col]){
        let top = this.opts.defaultPos[1] - this.opts.gridHeight * (row+1);
        let bottom = this.opts.defaultPos[1] - this.opts.gridHeight * row;
        let left = this.opts.defaultPos[0] + this.opts.gridWidth * col;
        let right = this.opts.defaultPos[0] + this.opts.gridWidth * (col+1);
        this.opts.shape_memo[(row*this.opts.gridSize)+col] = turf.polygon([
          [[left,bottom], [right,bottom], [right,top], [left,top], [left,bottom]]
        ], {});
      }
      return this.opts.shape_memo[(row*this.opts.gridSize)+col];
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
      if(a.plantNumber!=b.plantNumber){
        return parseFloat(a.plantNumber)>parseFloat(b.plantNumber)?1:-1
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
      this._obsUnit_plots = {};
      var layout_data = d3.values(this.layout_data);
      if(layout_data.every(d=>!isNaN(d.X)&&!isNaN(d.Y))){
        // has coordinates
        if(layout_data.every(d=>d.X==Math.floor(d.X)&&d.Y==Math.floor(d.Y))){
          // all integers, col/row not lat/long
          var same_pos = {};
          layout_data.forEach(obs=>{
            if(same_pos[obs.Y+","+obs.X]){
              same_pos[obs.Y+","+obs.X].push(obs.observationUnitDbId);
            }
            else{
              same_pos[obs.Y+","+obs.X] = [obs.observationUnitDbId];
              same_pos[obs.Y+","+obs.X].pos = [obs.Y,obs.X];
            }
          });
          d3.values(same_pos).forEach(group=>{
            let polygon = this.defaultPlot(group.pos[0],group.pos[1]);
            let subdiv = this.polygon_subdivide(
              polygon,group.length
            );
            group.forEach((obs_id,i)=>{
              this._obsUnit_plots[obs_id] = polygon;
              this._obsUnit_shapes[obs_id] = subdiv[i];
            });
          });
        }
      }
      else {
        // position should be determined by rep/block/plot
        // picks a field width that trys to the median block-length evenly
        var plot_counts = d3.nest().key(d=>d.plotNumber).rollup(g=>g.length).entries(layout_data);
        var block_counts = d3.nest().key(d=>d.blockNumber).key(d=>d.plotNumber).rollup(g=>g.length).entries(layout_data);
        var bllen = Math.round(d3.median(block_counts,n=>n.values.length));
        var squarelen = Math.round(Math.sqrt(plot_counts.length));
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
        var plot_pos = {};
        var next_pos = 0;
        var same_pos = {};
        layout_data.sort(this.defaultPlot_sort).forEach((obs)=>{
          var pos = plot_pos[obs.plotNumber]!=undefined?plot_pos[obs.plotNumber]:(plot_pos[obs.plotNumber] = next_pos++);
          var row = Math.floor(pos/lyt_width);
          var col = (pos%lyt_width);
          if (row%2==1) col = (lyt_width-1)-col;
          if(same_pos[row+","+col]){
            same_pos[row+","+col].push(obs.observationUnitDbId);
          }
          else{
            same_pos[row+","+col] = [obs.observationUnitDbId];
            same_pos[row+","+col].pos = [row,col];
          }
        });
        d3.values(same_pos).forEach(group=>{
          let polygon = this.defaultPlot(group.pos[0],group.pos[1]);
          let subdiv = this.polygon_subdivide(
            polygon,group.length
          );
          group.forEach((obs_id,i)=>{
            this._obsUnit_plots[obs_id] = polygon;
            this._obsUnit_shapes[obs_id] = subdiv[i];
          });
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

    // HeatMap.prototype.shape_hullDist = function(feature_collection){
    //   var length = feature_collection.features.length;
    //   return Math.sqrt(d3.max(feature_collection.features,f=>turf.area(f)))/1000*1.01;
    // }

    HeatMap.prototype.shape_concave_hull = function(obsUnits){
      return turf.union(...obsUnits.map(obs=>this._obsUnit_plots[obs.observationUnitDbId]));
      // var feature_collection = turf.featureCollection(
      //   obsUnits.reduce((a,obs)=>{
      //     a.push(this._obsUnit_shapes[obs.observationUnitDbId]);
      //     a.push(turf.centroid(this._obsUnit_shapes[obs.observationUnitDbId]));
      //     return a;
      //   },[])
      // );
      // return turf.concave(
      //   turf.explode(feature_collection),
      //   {maxEdge:this.shape_hullDist(feature_collection),units:'kilometers'}
      // );
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
    HeatMap.prototype.polygon_subdivide_memo = {};
    HeatMap.prototype.polygon_subdivide = function(polygon,divisions){
      if(!divisions||divisions<2){
        return [polygon]
      }
      else{
        let memo_id = `(${divisions})${JSON.stringify(polygon.geometry.coordinates)}`;
        if (!this.polygon_subdivide_memo[memo_id]){
          let polygonbbox = turf.bbox(polygon);
          polygonbbox[0]-=0.00001;
          polygonbbox[1]-=0.00001;
          polygonbbox[2]+=0.00001;
          polygonbbox[3]+=0.00001;
          let grid_dist = (Math.sqrt(turf.area(polygon))/1000)/(2*divisions);
          let grid = turf.pointGrid(
            polygonbbox,
            grid_dist,
            {'mask':polygon}
          );
          //more random!
          grid.features.forEach(f=>{
            f.geometry.coordinates=f.geometry.coordinates.map(c=>c+=Math.random()*0.000002-0.000001);
          });
          let clustered = turf.clustersKmeans(
            grid,
            {'numberOfClusters':divisions,'mutate':true}
          );
          let centroids = [];
          for (var i = 0; i < divisions; i++) {
            centroids.push(
              turf.centroid(
                turf.getCluster(clustered, {cluster: i})
              )
            );
          }
          var voronoi = turf.voronoi(
            turf.featureCollection(centroids),
            {'bbox':polygonbbox}
          );
          this.polygon_subdivide_memo[memo_id] = voronoi.features.map(vc=>{
            var mask = turf.mask(vc,turf.bboxPolygon(polygonbbox));
            var c = turf.difference(polygon,mask);
            return c
          });
        }
        return this.polygon_subdivide_memo[memo_id];
      }
    };
  }

  function startLoad(HeatMap){
    /**
     * Loads Phenotype/ObservationUnit Data via BrAPI
     */
    HeatMap.prototype.startLoad = function(){
      this.fieldLayout.classed("Heatmap_loading",true);
      this.layout_data = {};
      this.controls.unit_sel.attr("disabled",true);
      BrAPI(this.brapi_endpoint,this.opts.brapi_auth,"1.2")
        .phenotypes_search({
          "studyDbIds":[this.studyDbId],
          "observationLevel":this.opts.observationLevel,
          'pageSize':this.opts.brapi_pageSize
        })
        .each(d=>{
          d.X = parseFloat(d.X);
          d.Y = parseFloat(d.Y);
          this.layout_data[d.observationUnitDbId] = d;
          this.reshape();
        })
        .all(()=>{
          this.fieldLayout.classed("Heatmap_loading",false);
          this._redraw_controls();
          this.controls.unit_sel.attr("disabled",null);
          console.log(this.layout_data);
        });
    };
  }

  function trait(HeatMap){
    HeatMap.prototype.trait_set = function(t){
      this.controls._trait = t;
      this.colorscale = d3.scaleSequential(d3.interpolatePlasma);
      let trait_accessor = this.trait_accessor(t);
      this.colorscale.domain(
        d3.extent(
          d3.values(this.layout_data),
          trait_accessor
        )
      );
      this.traitcolor = obs=>{
        let val = trait_accessor(obs);
        if(val==undefined) return "none";
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
    observationLevel:"plot",
    brapi_auth:null,
    brapi_pageSize:1000,
    defaultPos: [-39.0863,-12.6773],
    gridSize: 500,
    gridDist: 0.002,
    zoomAnimation:false,
    draw_controls:true,
    draw_control_trait:true,
    draw_control_unit:true,
    draw_control_rep:true,
    draw_control_block:true,
  };

  class HeatMap {
    constructor(map_container,controls_container,brapi_endpoint,studyDbId,opts) {
      this.map_container = d3.select(map_container);
      this.controls = {};
      this.controls.container = d3.select(controls_container);
      this.brapi_endpoint = brapi_endpoint;
      this.studyDbId = studyDbId;
      
      // Parse Options
      this.opts = Object.assign(Object.create(DEFAULT_OPTS),opts||{});
      
      // Create Default Plot Positions
      this.defaultPlot_init();

      // Set up debouncing
      this.reshape = debounceThrottle(()=>this.shape_reshape());
      this.redraw = debounceThrottle(()=>this._redraw());

      // Set up Leaflet Map
      this.map = L.map(this.map_container.node(),{zoomAnimation:this.opts.zoomAnimation,zoomSnap:0.1});
      this.map.on('viewreset', ()=>this._redraw());
      this.map.on('resize', ()=>this._redraw());
      this.map.on('zoomend', ()=>this._redraw());

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
      this.zoomer = this.svg.append("g").attr("class", "leaflet-zoom-hide zoom-hide-transition");
      this.content = this.zoomer.append("g");
      this.fieldLayout = this.content.classed("HeatMap_layout",true);
      this.obsUnits = this.fieldLayout.append("g").classed("HeatMap_obsUnits",true);
      this.reps = this.fieldLayout.append("g").classed("HeatMap_reps",true);
      this.blocks = this.fieldLayout.append("g").classed("HeatMap_blocks",true);

      // Set up the Controls
      this.controls.div = this.controls.container.append("div")
        .classed("HeatMap_controls",true)
        .style("padding","10px 10px 0px 10px");
      this.controls.units = this.controls.div.append("div");
      this.controls.units.append("span").text("Observation Level");
      this.controls.unit_sel = this.controls.units.append("select");
      this.controls.unit_sel.append("option").attr("value","plot")
        .text("Plot")
        .attr("selected",this.opts.observationLevel=="plot"?true:null);
      this.controls.unit_sel.append("option").attr("value","plant")
        .text("Plant")
        .attr("selected",this.opts.observationLevel=="plant"?true:null);
      this.controls.unit_sel.on("change",()=>{
        this.opts.observationLevel = this.controls.unit_sel.node().value;
        this.startLoad();
        this.trait_set(null);
      });
      this.controls.traits = this.controls.div.append("select")
        .classed("HeatMap_trait_select",true);
      this.controls.div.append("br");
      this.controls.legend = this.controls.div.append("svg")
        .attr("width", 280)
        .attr("height", 45)
        .append("g")
        .attr("transform", "translate(0,10)");
      this.controls.traits.on("change",()=>{
        this.trait_set(this.controls.traits.node().value);
      });

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
