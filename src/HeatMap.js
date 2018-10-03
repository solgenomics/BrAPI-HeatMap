import d3 from "d3";
import L from "leaflet";

const DEFAULT_OPTS = {
  observationLevel:"plot",
  trait:null, // 76913 76900 76884 76861
  brapi_auth:null,
  brapi_pageSize:1000,
  defaultPos: [-39.0863,-12.6773],
  gridSize: 500,
  defaultPlotWidth: 0.002,
}

export default class HeatMap {
  constructor(map_container,controls_container,brapi_endpoint,studyDbId,opts) {
    this.map_container = d3.select(map_container);
    this.controls = {};
    this.controls.container = d3.select(controls_container);
    this.brapi_endpoint = brapi_endpoint;
    this.studyDbId = studyDbId;
    
    // Parse Options
    this.opts = Object.assign(Object.create(DEFAULT_OPTS),opts||{});

    // Set up Leaflet Map
    this.map = L.map(
      this.map_container.node(),
      {
        zoomSnap:0.1,
        zoom: 17
      }
    );
    
    // Load Data
    this.layout_data = {};
    this.load_ObsUnits();
    
    this.canvLayer = L.canvasLayer()
      .delegate(this)
      .addTo(this.map);
  }
  
  onDrawLayer(info) {
    var ctx = info.canvas.getContext('2d');
    let map = this.map;
    let transform = d3.geoTransform({point: function(x,y){
      var point = info.layer._map.latLngToContainerPoint([y, x]);
      this.stream.point(point.x,point.y);
    }})
    let geoPath = d3.geoPath().context(ctx).projection(transform);
    this.data.then(d=>{
      ctx.clearRect(0, 0, info.canvas.width, info.canvas.height);
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      d.plots.forEach(plot=>{
        ctx.fillStyle = plot.fillColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        geoPath(plot.geoJSON);
        ctx.fill();
        ctx.fillStyle = plot.textColor;
        var fontSize = Math.sqrt(geoPath.area(plot.geoJSON))/5;
        ctx.font = fontSize+'px monospace';
        var centroid = geoPath.centroid(plot.geoJSON);
        ctx.fillText(plot.plotNumber, centroid[0], centroid[1]);
      });
      d.reps.forEach(rep=>{
        ctx.strokeStyle = "blue";
        ctx.lineWidth = 4;
        ctx.beginPath();
        geoPath(rep.geoJSON);
        ctx.stroke();
      })
      d.blocks.forEach(block=>{
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.beginPath();
        geoPath(block.geoJSON);
        ctx.stroke();
      })
    })
  }
  
  traitColor(data){
    let colorScale;
    if(!data.plot_traits[this.opts.trait]) colorScale = ()=>"transparent";
    else colorScale = d3.scaleSequential(d3.interpolateMagma).domain([
      data.plot_traits[this.opts.trait].min,
      data.plot_traits[this.opts.trait].max
    ]);
    data.plots.forEach(plot=>{
      let tObs = plot.observations.filter(obs=>obs.observationVariableDbId==this.opts.trait);
      let avg = d3.mean(tObs,obs=>obs.value);
      let c = d3.color(colorScale(avg));
      if(c) c.opacity = 0.7;
      plot.fillColor = tObs.length>0?c:"transparent";
      plot.textColor = this.goodContrast(plot.fillColor);
    })
    return data;
  }
  
  goodContrast(color){
    color = d3.color(color).rgb();
    let l = ( 0.299 * color.r + 0.587 * color.g + 0.114 * color.b)/255;
    return l>0.5?"black":"white";
  }
  
  setLevel(level){
    if (level == "plot" || level == "plant") {
      this.opts.observationLevel = level
      this.data = this.data.then(d=>this.traitColor(d));
      this.canvLayer.drawLayer();
    }
    else throw Error("not a valid observation level");
  }
  
  getTraits(cb){
    let out = this.data.then(d=>d3.values(d.plot_traits));
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
        t.min = Math.min(obs.value,t.min);
        t.max = Math.max(obs.value,t.max);
      })
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
        t.min = Math.min(obs.value,t.min);
        t.max = Math.max(obs.value,t.max);
      })
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
      })
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
      let plot_count = d3.mean(plot_XY_groups,x=>{
        return x!=undefined?d3.mean(x,xy=>xy!=undefined?xy.length:null):null
      });
      let plotArea = plot_count*this.opts.defaultPlotWidth*this.opts.defaultPlotWidth;
      let plotSize = Math.sqrt(plotArea);
      // this.setDefaultPlotSize(Math.sqrt(plotArea));
      for (let X in plot_XY_groups) {
        if (plot_XY_groups.hasOwnProperty(X)) {
          for (let Y in plot_XY_groups[X]) {
            if (plot_XY_groups[X].hasOwnProperty(Y)) {
              let polygon = this.defaultPlot(Y,X,plotSize);
              // console.log("p",polygon);
              plot_XY_groups[X][Y].forEach((plot,i)=>{
                plot.geoJSON = polygon;//this.splitPlot(polygon,plot_XY_groups[X][Y].length,i);
              })
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
      })
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
      let plant_count = d3.mean(plant_XY_groups,x=>{
        return x!=undefined?d3.mean(x,xy=>xy!=undefined?xy.length:null):null
      });
      let plantArea = plant_count*this.opts.defaultPlotWidth*this.opts.defaultPlotWidth;
      let plantSize = Math.sqrt(plantArea);
      for (let X in plant_XY_groups) {
        if (plant_XY_groups.hasOwnProperty(X)) {
          for (let Y in plant_XY_groups[X]) {
            if (plant_XY_groups[X].hasOwnProperty(Y)) {
              console.log(Y,X,plantSize);
              let polygon = this.defaultPlot(Y,X,plantSize);
              plant_XY_groups[X][Y].forEach((plant,i)=>{
                plant.geoJSON = polygon;
              })
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
    
    let polygonbbox = turf.bbox(polygon);
    polygonbbox[0]-=0.00001; polygonbbox[1]-=0.00001; polygonbbox[2]+=0.00001; polygonbbox[3]+=0.00001;
    let w = Math.sqrt(turf.area(polygon))/1000;
    let count = 50 + 10*partitions;
    let grid_dist = w/Math.sqrt(count);
    let grid = turf.pointGrid(polygonbbox,grid_dist,{'mask':polygon});
    //more random! (prevents ugly vertical or horizontal partitions)
    grid.features.forEach(f=>{f.geometry.coordinates=f.geometry.coordinates.map(c=>c+=Math.random()*0.000002-0.000001)});
    let clustered = turf.clustersKmeans(
      grid,
      {'numberOfClusters':partitions,'mutate':true}
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
    )
    this.splitPlot_memo[memo_id] = voronoi.features.map(vc=>{
      var a = vc;
      var b = polygon;
      var mask = turf.mask(vc,turf.bboxPolygon(polygonbbox));
      var c = turf.difference(polygon,mask);
      return c
    });
    return this.splitPlot_memo[memo_id][index];
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
      var rej = reject;
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

import defaultPlot from './defaultPlot.js'; defaultPlot(HeatMap);
