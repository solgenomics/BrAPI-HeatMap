(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('@turf/turf'), require('d3'), require('leaflet')) :
  typeof define === 'function' && define.amd ? define(['@turf/turf', 'd3', 'leaflet'], factory) :
  (global.BrAPIHeatMap = factory(global.turf,global.d3,global.L));
}(this, (function (turf$1,d3,L) { 'use strict';

  turf$1 = turf$1 && turf$1.hasOwnProperty('default') ? turf$1['default'] : turf$1;
  d3 = d3 && d3.hasOwnProperty('default') ? d3['default'] : d3;
  L = L && L.hasOwnProperty('default') ? L['default'] : L;

  function defaultPlot(HeatMap){  
    HeatMap.prototype.defaultPlot = function(row,col,size){
      size = size || this.opts.defaultPlotWidth;
      if(!this.opts.shape_memo || this.opts.shape_memo.size!=size){
        this.opts.shape_memo = Array(this.opts.gridSize*this.opts.gridSize);
        this.opts.shape_memo.size = size;
      } 
      console.log(size);
      if(!this.opts.shape_memo[(row*this.opts.gridSize)+col]){
        var o = turf$1.point(this.opts.defaultPos);
        var tl = turf$1.destination(
          turf$1.destination(
            o,
            size*col,
            90,
            {'units':'kilometers'}
          ),
          size*row,
          180,
          {'units':'kilometers'}
        );
        var br = turf$1.destination(
          turf$1.destination(
            tl,
            size,
            90,
            {'units':'kilometers'}
          ),
          size,
          180,
          {'units':'kilometers'}
        );
        var tr = turf$1.point([tl.geometry.coordinates[0],br.geometry.coordinates[1]]);
        var bl = turf$1.point([br.geometry.coordinates[0],tl.geometry.coordinates[1]]);
        this.opts.shape_memo[(row*this.opts.gridSize)+col] = turf$1.polygon([
          [tl, tr, br, bl, tl].map(turf$1.getCoord)
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

  // import turf from "@turf/turf";
  // 
  // export default function(HeatMap){
  //   HeatMap.prototype.setDefaultPlotSize = function(size){ // size is width in km
  //     this.opts._plotsize = size;
  //     this.opts.gridHeight = turf.distance(this.opts.defaultPos,turf.along(turf.lineString([this.opts.defaultPos,[this.opts.defaultPos[0],this.opts.defaultPos[1]-1]]),size*this.opts.gridSize),{'units':"degrees"})/this.opts.gridSize;
  //     this.opts.gridWidth = turf.distance(this.opts.defaultPos,turf.along(turf.lineString([this.opts.defaultPos,[this.opts.defaultPos[0]+1,this.opts.defaultPos[1]]]),size*this.opts.gridSize),{'units':"degrees"})/this.opts.gridSize;
  //     this.opts.shape_memo = Array(this.opts.gridSize*this.opts.gridSize);
  //   }
  // 
  //   HeatMap.prototype.defaultPlot = function(row,col){
  //     if(!this.opts.shape_memo[(row*this.opts.gridSize)+col]){
  //       let top = this.opts.defaultPos[1] - this.opts.gridHeight * (row+1);
  //       let bottom = this.opts.defaultPos[1] - this.opts.gridHeight * row;
  //       let left = this.opts.defaultPos[0] + this.opts.gridWidth * col;
  //       let right = this.opts.defaultPos[0] + this.opts.gridWidth * (col+1);
  //       this.opts.shape_memo[(row*this.opts.gridSize)+col] = turf.polygon([
  //         [[left,bottom], [right,bottom], [right,top], [left,top], [left,bottom]]
  //       ], {});
  //     }
  //     return this.opts.shape_memo[(row*this.opts.gridSize)+col];
  //   }
  // }

  const DEFAULT_OPTS = {
    observationLevel:"plot",
    trait:null, // 76913 76900 76884 76861
    brapi_auth:null,
    brapi_pageSize:1000,
    defaultPos: [-39.0863,-12.6773],
    gridSize: 500,
    defaultPlotWidth: 0.002,
    showNames:true,
    showBlocks:true,
    showReps:true
  };

  class HeatMap {
    constructor(map_container,brapi_endpoint,studyDbId,opts) {
      this.map_container = d3.select(map_container);
      this.brapi_endpoint = brapi_endpoint;
      this.studyDbId = studyDbId;
      
      // Parse Options
      this.opts = Object.assign(Object.create(DEFAULT_OPTS),opts||{});

      // Set up Leaflet Map
      this.map = L.map(
        this.map_container.node(),
        {zoomSnap:0.1}
      );
      
      // Load Data
      this.layout_data = {};
      this.load_ObsUnits();
      
      this.canvLayer = L.canvasLayer()
        .delegate(this)
        .addTo(this.map);
      
      this.overlay = this.map_container.append("canvas")
        .attr("width",250)
        .attr("height",50)
        .style("top","10px")
        .style("left","40px")
        .style("position","absolute")
        .style("z-index",1000)
        .style("pointer-events","none");
      
    }
    
    onDrawLayer(info) {
      var ctx = info.canvas.getContext('2d');
      let map = this.map;
      let transform = d3.geoTransform({point: function(x,y){
        var point = info.layer._map.latLngToContainerPoint([y, x]);
        this.stream.point(point.x,point.y);
      }});
      let geoPath = d3.geoPath().context(ctx).projection(transform);
      this.data.then(d=>{
        ctx.clearRect(0, 0, info.canvas.width, info.canvas.height);
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        (this.opts.observationLevel=="plant"?d.plants:d.plots).forEach(ou=>{
          ctx.fillStyle = ou.fillColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          geoPath(ou.geoJSON);
          ctx.fill();
          var fontSize = Math.sqrt(geoPath.area(ou.geoJSON))/5;
          let textfill = d3.color(ou.textColor);
          textfill.opacity = fontSize>10?1:Math.pow(fontSize/10,2);
          ctx.fillStyle = textfill;
          ctx.font = fontSize+'px monospace';
          var centroid = geoPath.centroid(ou.geoJSON);
          if(this.opts.showNames) ctx.fillText(
            ou.plotNumber+(ou.plantNumber?":"+ou.plantNumber:""), 
            centroid[0], 
            centroid[1]
          );
        });
        if(this.opts.observationLevel=="plant"){
          d.plots.forEach(ou=>{
            ctx.strokeStyle = "black";
            ctx.lineWidth = 1;
            ctx.beginPath();
            geoPath(ou.geoJSON);
            ctx.stroke();
          });
        }
        if(this.opts.showReps) d.reps.forEach(rep=>{
          ctx.strokeStyle = "blue";
          ctx.lineWidth = 4;
          ctx.beginPath();
          geoPath(rep.geoJSON);
          ctx.stroke();
        });
        if(this.opts.showBlocks) d.blocks.forEach(block=>{
          ctx.strokeStyle = "white";
          ctx.lineWidth = 2;
          ctx.beginPath();
          geoPath(block.geoJSON);
          ctx.stroke();
        });
      });
    }
    
    traitColor(data){
      let ou_traits,ous;
      if(this.opts.observationLevel=="plant"){
        ou_traits = data.plant_traits;
        ous = data.plants;
      }
      else {
        ou_traits = data.plot_traits;
        ous = data.plots;
      }
      if(!ou_traits[this.opts.trait]) this.colorScale = ()=>"transparent";
      else this.colorScale = d3.scaleSequential(d3.interpolateMagma).domain([
        ou_traits[this.opts.trait].min,
        ou_traits[this.opts.trait].max
      ]);
      ous.forEach(ou=>{
        let tObs = ou.observations.filter(obs=>obs.observationVariableDbId==this.opts.trait);
        let avg = d3.mean(tObs,obs=>obs.value);
        let c = !isNaN(avg) ? d3.color(this.colorScale(avg)) : "transparent";
        if(c!="transparent") c.opacity = 0.7;
        ou.fillColor = c;
        ou.textColor = this.goodContrast(ou.fillColor);
      });
      
      var octx = this.overlay.node().getContext('2d');
      octx.clearRect(0, 0, 400, 400);
      let scale = {
        x:10,
        y:2,
        width:200,
        height:16,
        padding:1,
        text:10,
        d:4
      };
      if(ou_traits[this.opts.trait]){
        
        let bgcol = d3.color("black");
        bgcol.opacity = 0.8;
        octx.fillStyle = bgcol;   
        octx.lineWidth = 0;
        octx.beginPath();
        octx.rect(scale.x,scale.y,scale.width,scale.y+scale.height+scale.padding*2+scale.text);
        octx.fill();
        
        let sd2 = d3.format(".2r");
        octx.textBaseline = "middle";
        octx.textAlign = "left";
        octx.fillStyle = "white";
        octx.font = '10px monospace';
        octx.fillText(sd2(ou_traits[this.opts.trait].min), scale.x+scale.text*0.4, scale.y+scale.height+scale.padding+scale.text/2);
        octx.textAlign = "right";
        octx.fillText(sd2(ou_traits[this.opts.trait].max), scale.x+scale.width-scale.text*0.4, scale.y+scale.height+scale.padding+scale.text/2);
        
        
        
        for (var i = 0; i < scale.width; i+=scale.d) {
          octx.fillStyle = d3.interpolateMagma((i+(scale.d/2))/scale.width);      
          octx.beginPath();
          octx.rect(scale.x+i,scale.y,scale.d,scale.height);
          octx.fill();
        }
        
        octx.beginPath();
        octx.rect(scale.x,scale.y,scale.width,scale.y+scale.height+scale.padding*2+scale.text);
        octx.strokeStyle = "white";   
        octx.lineWidth = 1;
        octx.stroke();
      }
      
      return data;
    }
    
    goodContrast(color){
      color = d3.color(color).rgb();
      let l = ( 0.299 * color.r + 0.587 * color.g + 0.114 * color.b)/255;
      return l>0.5?"black":"white";
    }
    
    setLevel(level){
      if (level == "plot" || level == "plant") {
        this.opts.observationLevel = level;
        this.data = this.data.then(d=>this.traitColor(d));
        this.canvLayer.drawLayer();
      }
      else throw Error("not a valid observation level");
    }
    
    getTraits(cb){
      let out = this.data.then(d=>d3.values(this.opts.observationLevel=="plant"?d.plant_traits:d.plot_traits));
      if(cb) out.then(cb);
      else return out
    }
    
    setTrait(tId){
      console.log(tId,typeof tId);
      this.opts.trait = tId;
      this.data = this.data.then(d=>this.traitColor(d));
      this.canvLayer.drawLayer();
    }
    
    parseTraits(data){
      data.plot_traits = {};
      data.plant_traits = {};
      data.plants.forEach(plant=>{
        plant.observations.forEach(obs=>{
          obs.observationVariableDbId = ""+obs.observationVariableDbId;
          if(!data.plant_traits[obs.observationVariableDbId]){
            data.plant_traits[obs.observationVariableDbId] = {
              min:(Infinity),
              max:(-Infinity),
              name:obs.observationVariableName,
              id:obs.observationVariableDbId
            };
          }
          let t = data.plant_traits[obs.observationVariableDbId];
          if(!isNaN(obs.value)){
            t.min = Math.min(obs.value,t.min);
            t.max = Math.max(obs.value,t.max);
          }
        });
      });
      data.plots.forEach(plot=>{
        plot.observations.forEach(obs=>{
          obs.observationVariableDbId = ""+obs.observationVariableDbId;
          if(!data.plot_traits[obs.observationVariableDbId]){
            data.plot_traits[obs.observationVariableDbId] = {
              min:(Infinity),
              max:(-Infinity),
              name:obs.observationVariableName,
              id:obs.observationVariableDbId
            };
          }
          let t = data.plot_traits[obs.observationVariableDbId];
          if(!isNaN(obs.value)){
            t.min = Math.min(obs.value,t.min);
            t.max = Math.max(obs.value,t.max);
          }
        });
      });
      return data
    }
    
    shape(data){
      data.shape = {};
      // Shape Plots
      let plotsHaveCoords = data.plots.every(plot=>(
        !isNaN(plot.X) && !isNaN(plot.Y)
      ));
      let plotsRowColOnly = plotsHaveCoords && data.plots.every(plot=>(
        plot.X==Math.floor(plot.X) && plot.Y==Math.floor(plot.Y)
      ));
      if(!plotsHaveCoords){
        // No layout info, generate X/Y by guessing
        // Auto-layout (layout width by even divisions of median block length near a perfect square)
        var lyt_width = this.layout_width(
          Math.round(d3.median(data.blocks,block=>block.values.length)),
          data.plots.length
        );
        data.plots.forEach((plot,pos)=>{
          let row = Math.floor(pos/lyt_width);
          let col = (pos%lyt_width);
          if (row%2==1) col = (lyt_width-1)-col;
          plot.X = col;
          plot.Y = row;
        });
      }
      let plot_XY_groups = [];
      let plotNumber_group = {};
      // group by plots with the same X/Y
      data.plots.forEach(plot=>{
        plot_XY_groups[plot.X] = plot_XY_groups[plot.X] || [];
        plot_XY_groups[plot.X][plot.Y] = plot_XY_groups[plot.X][plot.Y] || [];
        plot_XY_groups[plot.X][plot.Y].push(plot);
        plotNumber_group[plot.plotNumber] = plot_XY_groups[plot.X][plot.Y];
      });
      if (!plotsRowColOnly && plotsHaveCoords) {
        // Voronoi-it
        throw Error("Not Implemented");
      }
      else{
        // use default plot generator
        // let plot_count = d3.mean(plot_XY_groups,x=>{
        //   return x!=undefined?d3.mean(x,xy=>xy!=undefined?xy.length:null):null
        // });
        // let plotArea = plot_count*this.opts.defaultPlotWidth*this.opts.defaultPlotWidth;
        // let plotSize = Math.sqrt(plotArea);
        // this.setDefaultPlotSize(Math.sqrt(plotArea));
        for (let X in plot_XY_groups) {
          if (plot_XY_groups.hasOwnProperty(X)) {
            for (let Y in plot_XY_groups[X]) {
              if (plot_XY_groups[X].hasOwnProperty(Y)) {
                let polygon = this.defaultPlot(Y,X,this.opts.defaultPlotWidth);
                plot_XY_groups[X][Y].forEach((plot,i)=>{
                  plot.geoJSON = this.splitPlot(polygon,plot_XY_groups[X][Y].length,i);
                });
              }
            }
          }
        }
      }
      
      let plant_XY_groups = [];
      let plantsHaveCoords = data.plants.every(plant=>(
        !isNaN(plant.X) && !isNaN(plant.Y)
      ));
      let plantsHavePlotNumber = data.plants.every(plant=>(
        !isNaN(plant.plotNumber)
      ));
      let plantsRowColOnly = plantsHaveCoords && data.plants.every(plant=>(
        plant.X==Math.floor(plant.X) && plant.Y==Math.floor(plant.Y)
      ));
      if(!plantsHaveCoords && plantsHavePlotNumber && plot_XY_groups){
        data.plants.forEach(plant=>{
          plant.X = plotNumber_group[plant.plotNumber][0].X;
          plant.Y = plotNumber_group[plant.plotNumber][0].Y;
        });
      }
      // group by plants with the same X/Y
      data.plants.forEach(plant=>{
        plant_XY_groups[plant.X] = plant_XY_groups[plant.X] || [];
        plant_XY_groups[plant.X][plant.Y] = plant_XY_groups[plant.X][plant.Y] || [];
        plant_XY_groups[plant.X][plant.Y].push(plant);
      });
      if (!plantsRowColOnly && plantsHaveCoords) {
        // Voronoi-it
        throw Error("Not Implemented");
      }
      else{
        // use default plant generator
        // let plant_count = d3.mean(plant_XY_groups,x=>{
        //   return x!=undefined?d3.mean(x,xy=>xy!=undefined?xy.length:null):null
        // });
        // let plantArea = plant_count*this.opts.defaultPlotWidth*this.opts.defaultPlotWidth;
        // let plantSize = Math.sqrt(plantArea);
        for (let X in plant_XY_groups) {
          if (plant_XY_groups.hasOwnProperty(X)) {
            for (let Y in plant_XY_groups[X]) {
              if (plant_XY_groups[X].hasOwnProperty(Y)) {
                let polygon = this.defaultPlot(Y,X,this.opts.defaultPlotWidth);
                plant_XY_groups[X][Y].forEach((plant,i)=>{
                  plant.geoJSON = this.splitPlot(polygon,plant_XY_groups[X][Y].length,i);
                });
              }
            }
          }
        }
      }
      
      // Has geoJSON
      data.blocks.forEach(block=>{
        block.geoJSON = turf.union(...block.values.map(ou=>turf.truncate(ou.geoJSON)));
      });
      data.reps.forEach(rep=>{
        rep.geoJSON = turf.union(...rep.values.map(ou=>turf.truncate(ou.geoJSON)));
      });
      
      if(this.new_data){
        var bbox = turf.bbox(turf.featureCollection(data[this.opts.observationLevel+"s"].map(ou=>ou.geoJSON)));
        this.map.fitBounds([[bbox[1],bbox[0]],[bbox[3],bbox[2]]]);
      }
      
      return data;
    }
    
    splitPlot(polygon,partitions,index){
      this.splitPlot_memo = this.splitPlot_memo || {};
      let memo_key = `(${partitions})${polygon.geometry.coordinates.join(",")}`;
      if(this.splitPlot_memo[memo_key]) return this.splitPlot_memo[memo_key][index];
      if(!partitions||partitions<2) return (this.splitPlot_memo[memo_key] = [polygon])[index];
      
      let scale_factor = 50; //prevents rounding errors
      let scale_origin = turf.getCoord(turf.centroid(polygon));
      polygon = turf.transformScale(polygon, scale_factor, {'origin':scale_origin});
      
      let row_width = Math.ceil(Math.sqrt(partitions));
      let row_counts = [];
      for (var i = 0; i < Math.floor(partitions/row_width); i++) {
        row_counts[i] = row_width;
      }
      if(partitions%row_width) row_counts[row_counts.length] = partitions%row_width;
      
      let polygonbbox = turf.bbox(polygon);
      polygonbbox[0]-=0.00001; polygonbbox[1]-=0.00001; polygonbbox[2]+=0.00001; polygonbbox[3]+=0.00001;
      let w = Math.sqrt(turf.area(polygon))/1000;
      let area = 50+100*partitions;
      let grid_dist = w/Math.sqrt(area);
      let grid = turf.pointGrid(polygonbbox,grid_dist,{'mask':polygon});
      let points = grid.features;
      
      let points_per_part = Math.floor(points.length/partitions);
      
      let row_point_counts = row_counts.map(rc=>rc*points_per_part);
      
      points = points.sort((b,a)=>d3.ascending(turf.getCoord(a)[1],turf.getCoord(b)[1]));
      
      let t = 0;
      let rows = [];
      row_point_counts.forEach((rpc,i)=>{
        rows[i] = [];
        while (rows[i].length<rpc && t<points.length){
          rows[i].push(points[t++]);
        }
      });
      
      let collecs = [];
      rows.forEach((row,ri)=>{
        row = row.sort((a,b)=>d3.ascending(turf.getCoord(a)[0],turf.getCoord(b)[0]));
        let p = 0;
        let c0 = collecs.length;
        for (var ci = c0; ci < c0+row_counts[ri]; ci++) {
          collecs[ci] = [];
          while (collecs[ci].length<points_per_part && p<row.length){
            collecs[ci].push(row[p++]);
          }
        }
      });
      let centroids = turf.featureCollection(collecs.map(c=>turf.centroid(turf.featureCollection(c))));
      var voronoi = turf.voronoi(
        centroids,
        {'bbox':polygonbbox}
      );
      this.splitPlot_memo[memo_key] = voronoi.features.map(vc=>{
        var mask = turf.mask(vc,turf.bboxPolygon(polygonbbox));
        var c = turf.difference(polygon,mask);
        return turf.transformScale(c, 1/scale_factor, {'origin':scale_origin})
      });
      return this.splitPlot_memo[memo_key][index];
    }
    
    layout_width(median_block_length,number_of_plots){
      let bllen = median_block_length;
      let squarelen = Math.round(Math.sqrt(number_of_plots));
      let lyt_width;
      if(squarelen==bllen){
        lyt_width = squarelen;
      }
      else if (squarelen>bllen) {
        lyt_width = Math.round(squarelen/bllen)*bllen;
      }
      else {
        let closest_up = (bllen%squarelen)/Math.floor(bllen/squarelen);
        let closest_down = (squarelen-bllen%squarelen)/Math.ceil(bllen/squarelen);
        lyt_width = Math.round(
          closest_up<=closest_down? 
            squarelen+closest_up: 
            squarelen-closest_down
        );
      }
      return lyt_width;
    }
    
    load_ObsUnits(){
      this.new_data = true;
      this.data_parsed = 0;
      this.data_total = 0;
      if(this.data && this.data_parsed!=this.data_total){
        this.data.reject("New Load Started");
      }
      var rej;
      var rawdata = new Promise((resolve,reject)=>{
        var brapi = BrAPI(this.brapi_endpoint,this.opts.brapi_auth,"1.2");
        var results = {'plots':[],'plants':[]};
        brapi.phenotypes_search({
            "studyDbIds":[this.studyDbId],
            'pageSize':this.opts.brapi_pageSize
          })
          .each(ou=>{
            ou.X = parseFloat(ou.X);
            ou.Y = parseFloat(ou.Y);
            if(ou.observationLevel=="plot") results.plots.push(ou);
            if(ou.observationLevel=="plant") results.plants.push(ou);
            this.data_parsed+=1;
            this.data_total = ou.__response.metadata.pagination.totalCount;
          })
          .all(()=>{
            // ensure unique
            var plot_map = {};
            results.plots = results.plots.reduce((acc,plot)=>{
              if(!plot_map[plot.observationUnitDbId]){
                plot_map[plot.observationUnitDbId] = plot;
                acc.push(plot);
              }
              return acc;
            },[]);
            var plant_map = {};
            results.plants = results.plants.reduce((acc,plant)=>{
              if(!plant_map[plant.observationUnitDbId]){
                plant_map[plant.observationUnitDbId] = plant;
                acc.push(plant);
              }
              return acc;
            },[]);
            
            // sort
            results.plots.sort(function(a,b){
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
            });
            results.plants.sort(function(a,b){
              if(a.plantNumber!=b.plantNumber){
                return parseFloat(a.plantNumber)>parseFloat(b.plantNumber)?1:-1
              }
            });
            
            if(results.plots.length>0){
              results.blocks = d3.nest().key(plot=>plot.blockNumber).entries(results.plots);
              results.reps = d3.nest().key(plot=>plot.replicate).entries(results.plots);
            }
            else {
              results.blocks = d3.nest().key(plant=>plant.blockNumber).entries(results.plants);
              results.reps = d3.nest().key(plant=>plant.replicate).entries(results.plants);
            }
            
            clearInterval(this.data.while_downloading);
            resolve(results);
          });
      });
      this.data = rawdata.then((d)=>this.shape(d))
        .then((d)=>this.parseTraits(d))
        .then(d=>this.traitColor(d));
      this.data.then(d=>console.log("loaded",d));
      this.data.reject = rej;
      this.data.while_downloading = setInterval(()=>{
        var status = this.data_parsed+"/"+this.data_total;
        console.log(status);
      },500);
      rawdata.catch(e=>{
        clearInterval(this.data.while_downloading);
        console.log(e);
      });
    }
  }
   defaultPlot(HeatMap);

  return HeatMap;

})));
