import d3 from "d3";
import L from "leaflet";
import "../lib/L.CanvasLayer.js";
import "../lib/leaflet.tilelayer.fallback.js";
import applyDefaultPlot from './defaultPlot.js'; 

const DEFAULT_OPTS = {
  observationLevel:"plot",
  brapi_auth:null,
  brapi_pageSize:1000,
  defaultPos: [-76.46823640912771,42.44668396825921],
  gridSize: 500,
  defaultPlotWidth: 0.002,
  showNames:true,
  showBlocks:true,
  showReps:true,
  onClick:()=>{}
}

const valFormat = d3.format(".2r");

export default class HeatMap {
  constructor(map_container,brapi_endpoint,studyDbId,opts) {
    this.map_container = d3.select(map_container)
      .style("background-color","#888");
    this.brapi_endpoint = brapi_endpoint;
    this.studyDbId = studyDbId;
    
    // Parse Options
    this.opts = Object.assign(Object.create(DEFAULT_OPTS),opts||{});

    // Set up Leaflet Map
    this.map = L.map(
      this.map_container.node(),
      {zoomSnap:0.1}
    );
    
    // Add Map Layer
    L.tileLayer.fallback('http://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false',{
        attribution: '&copy; <a href="http://www.esri.com/">Esri</a>, DigitalGlobe, GeoEye, i-cubed, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo, and the GIS User Community',
        maxZoom: 28,
        maxNativeZoom: 19
    }).addTo(this.map);
    
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
    
    this.tooltipSVG = this.map_container.append("svg")
      .attr("width","100%")
      .attr("height","100%")
      .style("top","0px")
      .style("left","0px")
      .style("position","absolute")
      .style("z-index",999)
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
    let layerP = (coords)=>{
      let p = info.layer._map.containerPointToLayerPoint(coords)
      return [p.x,p.y]
    };
    this.data = this.data.then(d=>{
      
      var voronoi = d3.voronoi()
        .x(ou=>geoPath.centroid(ou._geoJSON)[0])
        .y(ou=>geoPath.centroid(ou._geoJSON)[1]);
        
      var ous = this.opts.observationLevel=="plant"?d.plants:d.plots;
      d.voronoi = voronoi(ous);
      d.geoPath = geoPath;
      d3.select(info.canvas).on("mousemove",()=>this.mousemove());
      
      ctx.clearRect(0, 0, info.canvas.width, info.canvas.height);
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ous.forEach(ou=>{
        ctx.fillStyle = ou.fillColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        geoPath(ou._geoJSON);
        ctx.fill();
        var fontSize = Math.sqrt(geoPath.area(ou._geoJSON))/5;
        let textfill = d3.color(ou.textColor);
        textfill.opacity = fontSize>10?1:Math.pow(fontSize/10,2);
        ctx.fillStyle = textfill;
        ctx.font = fontSize+'px monospace';
        var centroid = geoPath.centroid(ou._geoJSON);
        if(this.opts.showNames) ctx.fillText(
          ou.plotNumber+(ou.plantNumber?":"+ou.plantNumber:""), 
          centroid[0], 
          centroid[1]
        );
      });
      d.plots.forEach(ou=>{
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 1;
        ctx.beginPath();
        geoPath(ou._geoJSON);
        ctx.stroke();
      });
      if(this.opts.showReps) d.reps.forEach(rep=>{
        ctx.strokeStyle = "blue";
        ctx.lineWidth = 4;
        ctx.beginPath();
        geoPath(rep._geoJSON);
        ctx.stroke();
      })
      if(this.opts.showBlocks) d.blocks.forEach(block=>{
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.beginPath();
        geoPath(block._geoJSON);
        ctx.stroke();
      })
      return d;
    })
  }
  
  mousemove(){
    var mx = d3.event.layerX;
    var my = d3.event.layerY;
    this.data.then(d=>{
      var site = d.voronoi.find(mx,my);
      var data = [site.data];
      if(site){
        var centroid = d.geoPath.centroid(site.data._geoJSON);
        var dist = Math.sqrt(d3.sum([mx-centroid[0],my-centroid[1]],d=>d*d))
        if(dist>Math.sqrt(d.geoPath.area(site.data._geoJSON))/2+5){
          data = []
        }
      }
      else data = [];
      
      var tt = this.tooltipSVG.selectAll(".HeatMap_ToolTip").data(data);
      tt.exit().remove();
      var ntt = tt.enter().append("g")
        .attr("opacity","0.8")
        .classed("HeatMap_ToolTip",true);
      ntt.append("rect")
        .attr("stroke-width","1px")
        .attr("stroke","white")
        .attr("width",100)
        .attr("height",100);
      ntt.append("g")
      
      var tooltip = tt.merge(ntt);
      var tooltiptext = tooltip.select("g").selectAll("text")
        .data(ou=>{ 
          var val = valFormat(d3.mean(ou.observations.filter(obs=>obs.observationVariableDbId==this.opts.trait),obs=>obs.value));
          return [
          `    Value: ${isNaN(val)?"???":val}`,
          `Germplasm: ${ou.germplasmName}`,
          `Replicate: ${ou.replicate}`,
          `    Block: ${ou.blockNumber}`,
          `  Row,Col: ${ou._row},${ou._col}`,
          `   Plot #: ${ou.plotNumber}`
        ].concat(this.opts.observationLevel=="plant"?[`  Plant #: ${ou.plantNumber}`]:[])
      })
      tooltiptext.exit().remove;
      tooltiptext.enter().append("text")
        .attr("x",10)
        .attr("y",(t,i)=>10*(i)+2)
        .attr("font-family","monospace")
        .attr("font-size","10px")
        .attr("fill","white")
        .merge(tooltiptext)
        .text(t=>t.replace(/\s/g,"\xa0"));
      tooltip.select("rect")
        .attr("width",function(){return d3.select(this.parentNode).select("g").node().getBBox().width+4})
        .attr("height",function(){return d3.select(this.parentNode).select("g").node().getBBox().height+2})
        .attr("x",function(){return d3.select(this.parentNode).select("g").node().getBBox().x-2})
        .attr("y",function(){return d3.select(this.parentNode).select("g").node().getBBox().y-1});
      tooltip.attr("transform",function(ou){
          var bounds = d.geoPath.bounds(ou._geoJSON);
          var bbox = this.getBBox();
          return `translate(${(bounds[0][0]+bounds[1][0])/2-bbox.width/2},${bounds[0][1]-bbox.height})`
        });
    })
  }
  
  traitColor(data){
    let ou_traits,ous;
    if(this.opts.observationLevel=="plant"){
      ou_traits = data.plant_traits
      ous = data.plants
    }
    else {
      ou_traits = data.plot_traits
      ous = data.plots
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
    })
    
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
    }
    if(ou_traits[this.opts.trait]){
      
      let bgcol = d3.color("black");
      bgcol.opacity = 0.8;
      octx.fillStyle = bgcol;   
      octx.lineWidth = 0;
      octx.beginPath();
      octx.rect(scale.x,scale.y,scale.width,scale.y+scale.height+scale.padding*2+scale.text);
      octx.fill();
      
      octx.textBaseline = "middle";
      octx.textAlign = "left";
      octx.fillStyle = "white";
      octx.font = '10px monospace';
      octx.fillText(valFormat(ou_traits[this.opts.trait].min), scale.x+scale.text*0.4, scale.y+scale.height+scale.padding+scale.text/2);
      octx.textAlign = "right";
      octx.fillText(valFormat(ou_traits[this.opts.trait].max), scale.x+scale.width-scale.text*0.4, scale.y+scale.height+scale.padding+scale.text/2);
      
      
      
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
      this.opts.observationLevel = level
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
    this.opts.trait = tId;
    this.data = this.data.then(d=>this.traitColor(d));
    this.canvLayer.drawLayer();
  }
  
  eachObservationUnit(tId,mutator,reshape){
    this.data = this.data.then(d=>{
      d.plots.concat(d.plants).forEach(ou=>mutator(ou));
      return d;
    })
    if(reshape) this.data = this.data.then((d)=>this.shape(d));
    this.data = this.data.then((d)=>this.parseTraits(d))
      .then(d=>this.traitColor(d));
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
        if(!isNaN(obs.value)){
          t.min = Math.min(obs.value,t.min);
          t.max = Math.max(obs.value,t.max);
        }
      })
    });
    return data
  }
  
  shape(data){
    data.shape = {};
    
    // Determine what information is available for each obsUnit
    data.plots.concat(data.plants).forEach((ou)=>{
      ou._X = ou.X || ou.positionCoordinateX;
      ou._Y = ou.Y || ou.positionCoordinateY;
      ou._geoJSON = ou.observationUnitGeoJSON
      ou._type = ""
      if (!isNaN(ou._X) && !isNaN(ou._Y)){
        if(ou.positionCoordinateXType 
           && ou.positionCoordinateYType){
          if(ou.positionCoordinateXType=="GRID_ROW" && ou.positionCoordinateYType=="GRID_COL"
             || ou.positionCoordinateXType=="GRID_COL" && ou.positionCoordinateYType=="GRID_ROW"){
            ou._row = parseInt(ou._Y) ? ou.positionCoordinateYType=="GRID_ROW" : ou._X;
            ou._col = parseInt(ou._X) ? ou.positionCoordinateXType=="GRID_COL" : ou._Y;
          }
          if(ou.positionCoordinateXType=="LONGITUDE" && ou.positionCoordinateYType=="LATITUDE"){
            if(!ou._geoJSON) ou._geoJSON = turf.point([ou._X,ou._Y]);
          }
        } 
        else {
          if(ou._X==Math.floor(ou._X) && ou._Y==Math.floor(ou._Y)){
            ou._row = parseInt(ou._Y);
            ou._col = parseInt(ou._X);
          }
          else {
            try {
              if(!ou._geoJSON) ou._geoJSON = turf.point([ou._X,ou._Y]);
            } catch (e) {}
          }
        }
      }
      if(ou._geoJSON){
        ou._type = turf.getType(ou._geoJSON)
      }
    });
    
    // Generate a reasonable plot layout if there is missing row/col data
    if( data.plots.some(plot=>isNaN(plot._row)||isNaN(plot._col)) ){
      var lyt_width = this.layout_width(
        Math.round(d3.median(data.blocks,block=>block.values.length)),
        data.plots.length
      );
      data.plots.forEach((plot,pos)=>{
        let row = Math.floor(pos/lyt_width);
        let col = (pos%lyt_width);
        if (row%2==1) col = (lyt_width-1)-col;
        plot._col = col;
        plot._row = row;
      })
    }
    
    // Shape Plots
    let plots_shaped = false;
    if(data.plots.every(plot=>(plot._type=="Polygon"))){ 
      // Plot shapes already exist!
      plots_shaped = true;
    } 
    else if(data.plots.every(plot=>(plot._type=="Point"||plot._type=="Polygon"))){
      // Create plot shapes using centroid Voronoi
      var centroids = turf.featureCollection(data.plots.map((plot,pos)=>{
        return turf.centroid(plot._geoJSON)
      }));
      var scale_factor = 50; //prevents rounding errors
      var scale_origin = turf.centroid(centroids);
      centroids = turf.transformScale(centroids,scale_factor,{origin:scale_origin});
      var bbox = turf.envelope(centroids);
      var area = turf.area(bbox);
      var offset = -Math.sqrt(area/data.plots.length)/1000/2;
      var hull = turf.polygonToLine(turf.convex(centroids, {units: 'kilometers'}));
      var crop = turf.lineToPolygon(turf.lineOffset(hull, offset, {units: 'kilometers'}));
      var voronoiBox = turf.lineToPolygon(turf.polygonToLine(turf.envelope(crop)));
      var cells = turf.voronoi(centroids,{bbox:turf.bbox(voronoiBox)});
      var cells_cropped = turf.featureCollection(cells.features.map(cell=>turf.intersect(cell,crop)));
      cells_cropped = turf.transformScale(cells_cropped,1/scale_factor,{origin:scale_origin});
      data.plots.forEach((plot,i)=>{
        plot._geoJSON = cells_cropped.features[i];
      })
      plots_shaped = true;
    } 
    
    let plot_XY_groups = [];
    let plotNumber_group = {};
    // group by plots with the same X/Y
    data.plots.forEach(plot=>{
      plot_XY_groups[plot._col] = plot_XY_groups[plot._col] || [];
      plot_XY_groups[plot._col][plot._row] = plot_XY_groups[plot._col][plot._row] || [];
      plot_XY_groups[plot._col][plot._row].push(plot);
      plotNumber_group[plot.plotNumber] = plot_XY_groups[plot._col][plot._row];
    });
    
    if(!plots_shaped){
      // Use default plot shapes/positions based on X/Y positions
      for (let X in plot_XY_groups) {
        if (plot_XY_groups.hasOwnProperty(X)) {
          for (let Y in plot_XY_groups[X]) {
            if (plot_XY_groups[X].hasOwnProperty(Y)) {
              X = parseInt(X)
              Y = parseInt(Y)
              let polygon = this.defaultPlot(Y,X,this.opts.defaultPlotWidth);
              // if for some reason plots have the same x/y, split that x/y region
              plot_XY_groups[X][Y].forEach((plot,i)=>{
                plot._geoJSON = this.splitPlot(polygon,plot_XY_groups[X][Y].length,i);
              })
            }
          }
        }
      }
    }
    
    // Use related plot row/col if plant row/col is missing.
    data.plants.forEach((plant,pos)=>{
      if(isNaN(plant._col)||isNaN(plant._row)){
        if(!isNaN(plant.plotNumber)){
          plant._col = plotNumber_group[plant.plotNumber][0]._col;
          plant._row = plotNumber_group[plant.plotNumber][0]._row;
        }
      }
    })
    // Generate a reasonable plant layout if there is still missing row/col data
    if( data.plants.some(plant=>isNaN(plant._row)||isNaN(plant._col)) ){
      var lyt_width = this.layout_width(
        Math.round(d3.median(data.blocks,block=>block.values.length)),
        data.plants.length
      );
      data.plants.forEach((plant,pos)=>{
        let row = Math.floor(pos/lyt_width);
        let col = (pos%lyt_width);
        if (row%2==1) col = (lyt_width-1)-col;
        plant._col = col;
        plant._row = row;
      })
    }
    
    // Shape Plants
    let plants_shaped = false;
    if(data.plants.every(plant=>(plant._type=="Polygon"))){ 
      // Plant shapes already exist!
      plants_shaped = true;
    } 
    else if(data.plants.every(plant=>(plant._type=="Point"||plant._type=="Polygon"))){
      // Create plant shapes using centroid Voronoi
      
      var centroids = turf.featureCollection(data.plants.map((plant,pos)=>{
        return turf.centroid(plant._geoJSON)
      }));
      var scale_factor = 50; //prevents rounding errors
      var scale_origin = turf.centroid(centroids);
      centroids = turf.transformScale(centroids,scale_factor,{origin:scale_origin});
      var bbox = turf.envelope(centroids);
      var area = turf.area(bbox);
      var offset = -Math.sqrt(area/data.plants.length)/1000/2;
      var hull = turf.polygonToLine(turf.convex(centroids, {units: 'kilometers'}));
      var crop = turf.lineToPolygon(turf.lineOffset(hull, offset, {units: 'kilometers'}));
      var voronoiBox = turf.lineToPolygon(turf.polygonToLine(turf.envelope(crop)));
      var cells = turf.voronoi(centroids,{bbox:turf.bbox(voronoiBox)});
      var cells_cropped = turf.featureCollection(cells.features.map(cell=>turf.intersect(cell,crop)));
      cells_cropped = turf.transformScale(cells_cropped,1/scale_factor,{origin:scale_origin});
      data.plants.forEach((plant,i)=>{
        plant._geoJSON = cells_cropped.features[i];
      })
      plants_shaped = true;
    } 
    
    let plant_XY_groups = [];
    // group by plants with the same X/Y
    data.plants.forEach(plant=>{
      plant_XY_groups[plant._col] = plant_XY_groups[plant._col] || [];
      plant_XY_groups[plant._col][plant._row] = plant_XY_groups[plant._col][plant._row] || [];
      plant_XY_groups[plant._col][plant._row].push(plant);
    });
    
    if(!plants_shaped){
      // Use default plant shapes/positions based on X/Y positions
      for (let X in plant_XY_groups) {
        if (plant_XY_groups.hasOwnProperty(X)) {
          for (let Y in plant_XY_groups[X]) {
            if (plant_XY_groups[X].hasOwnProperty(Y)) {
              X = parseInt(X)
              Y = parseInt(Y)
              let polygon = this.defaultPlot(Y,X,this.opts.defaultPlotWidth);
              plant_XY_groups[X][Y].forEach((plant,i)=>{
                plant._geoJSON = this.splitPlot(polygon,plant_XY_groups[X][Y].length,i);
              })
            }
          }
        }
      }
    }
    var ou_union = turf.union(
      ...data.plots.map(ou=>
        turf.truncate(ou._geoJSON,{'precision':7})
      )
    );
    data.blocks.forEach(block=>{
      var un = turf.featureCollection(
        block.values.map(ou=>
          turf.truncate(ou._geoJSON,{'precision':7})
        )
      );
      block._geoJSON = turf.union(turf.difference(turf.convex(un),ou_union),...un.features);
    });
    data.reps.forEach(rep=>{
      var un = turf.featureCollection(
        rep.values.map(ou=>
          turf.truncate(ou._geoJSON,{'precision':7})
        )
      );
      rep._geoJSON = turf.union(turf.difference(turf.convex(un),ou_union),...un.features);
    });
    
    if(this.new_data){
      var bbox = turf.bbox(turf.featureCollection(data[this.opts.observationLevel+"s"].map(ou=>ou._geoJSON)));
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
      row_counts[i] = row_width
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
    })
    
    let collecs = [];
    rows.forEach((row,ri)=>{
      row = row.sort((a,b)=>d3.ascending(turf.getCoord(a)[0],turf.getCoord(b)[0]));
      let p = 0;
      let c0 = collecs.length;
      for (var ci = c0; ci < c0+row_counts[ri]; ci++) {
        collecs[ci] = []
        while (collecs[ci].length<points_per_part && p<row.length){
          collecs[ci].push(row[p++]);
        }
      }
    })
    let centroids = turf.featureCollection(collecs.map(c=>turf.centroid(turf.featureCollection(c))));
    var voronoi = turf.voronoi(
      centroids,
      {'bbox':polygonbbox}
    );
    this.splitPlot_memo[memo_key] = voronoi.features.map(vc=>{
      var a = vc;
      var b = polygon;
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
          ou.observationUnitGeoJSON = mock_geojson[ou.observationUnitDbId]
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

applyDefaultPlot(HeatMap);

var mock_geojson = {
  "1183604": {
    "geometry": {
      "coordinates": [
        [
          [3.883603593, 7.490361341],
          [3.883637026, 7.490359842],
          [3.883638816, 7.490405062],
          [3.883605382, 7.490406561],
          [3.883603593, 7.490361341]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183490": {
    "geometry": {
      "coordinates": [
        [
          [3.883637026, 7.490359842],
          [3.883670459, 7.490358343],
          [3.883672249, 7.490403563],
          [3.883638816, 7.490405062],
          [3.883637026, 7.490359842]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183646": {
    "geometry": {
      "coordinates": [
        [
          [3.883670459, 7.490358343],
          [3.883703893, 7.490356844],
          [3.883705682, 7.490402064],
          [3.883672249, 7.490403563],
          [3.883670459, 7.490358343]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183655": {
    "geometry": {
      "coordinates": [
        [
          [3.883703893, 7.490356844],
          [3.883737326, 7.490355345],
          [3.883739115, 7.490400565],
          [3.883705682, 7.490402064],
          [3.883703893, 7.490356844]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183540": {
    "geometry": {
      "coordinates": [
        [
          [3.883737326, 7.490355345],
          [3.883770759, 7.490353846],
          [3.883772549, 7.490399066],
          [3.883739115, 7.490400565],
          [3.883737326, 7.490355345]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183642": {
    "geometry": {
      "coordinates": [
        [
          [3.883839769, 7.490405006],
          [3.883873203, 7.490403507],
          [3.883874993, 7.490448727],
          [3.883841559, 7.490450226],
          [3.883839769, 7.490405006]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183545": {
    "geometry": {
      "coordinates": [
        [
          [3.883806336, 7.490406505],
          [3.883839769, 7.490405006],
          [3.883841559, 7.490450226],
          [3.883808125, 7.490451725],
          [3.883806336, 7.490406505]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183532": {
    "geometry": {
      "coordinates": [
        [
          [3.883772903, 7.490408004],
          [3.883806336, 7.490406505],
          [3.883808125, 7.490451725],
          [3.883774692, 7.490453224],
          [3.883772903, 7.490408004]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183652": {
    "geometry": {
      "coordinates": [
        [
          [3.883739469, 7.490409503],
          [3.883772903, 7.490408004],
          [3.883774692, 7.490453224],
          [3.883741259, 7.490454723],
          [3.883739469, 7.490409503]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183566": {
    "geometry": {
      "coordinates": [
        [
          [3.883706036, 7.490411003],
          [3.883739469, 7.490409503],
          [3.883741259, 7.490454723],
          [3.883707826, 7.490456223],
          [3.883706036, 7.490411003]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183458": {
    "geometry": {
      "coordinates": [
        [
          [3.883672603, 7.490412501],
          [3.883706036, 7.490411003],
          [3.883707826, 7.490456223],
          [3.883674392, 7.490457721],
          [3.883672603, 7.490412501]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183590": {
    "geometry": {
      "coordinates": [
        [
          [3.883639169, 7.490414],
          [3.883672603, 7.490412501],
          [3.883674392, 7.490457721],
          [3.883640958, 7.49045922],
          [3.883639169, 7.490414]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183639": {
    "geometry": {
      "coordinates": [
        [
          [3.883605736, 7.490415499],
          [3.883639169, 7.490414],
          [3.883640958, 7.49045922],
          [3.883607525, 7.490460719],
          [3.883605736, 7.490415499]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183503": {
    "geometry": {
      "coordinates": [
        [
          [3.883574446, 7.490471156],
          [3.883607879, 7.490469657],
          [3.883609669, 7.490514877],
          [3.883576236, 7.490516376],
          [3.883574446, 7.490471156]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183475": {
    "geometry": {
      "coordinates": [
        [
          [3.883607879, 7.490469657],
          [3.883641313, 7.490468158],
          [3.883643102, 7.490513378],
          [3.883609669, 7.490514877],
          [3.883607879, 7.490469657]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183436": {
    "geometry": {
      "coordinates": [
        [
          [3.883641313, 7.490468158],
          [3.883674746, 7.49046666],
          [3.883676535, 7.49051188],
          [3.883643102, 7.490513378],
          [3.883641313, 7.490468158]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183491": {
    "geometry": {
      "coordinates": [
        [
          [3.883674746, 7.49046666],
          [3.883708179, 7.490465161],
          [3.883709968, 7.490510381],
          [3.883676535, 7.49051188],
          [3.883674746, 7.49046666]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183434": {
    "geometry": {
      "coordinates": [
        [
          [3.883708179, 7.490465161],
          [3.883741612, 7.490463662],
          [3.883743403, 7.490508882],
          [3.883709968, 7.490510381],
          [3.883708179, 7.490465161]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183598": {
    "geometry": {
      "coordinates": [
        [
          [3.883741612, 7.490463662],
          [3.883775046, 7.490462162],
          [3.883776836, 7.490507382],
          [3.883743403, 7.490508882],
          [3.883741612, 7.490463662]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183448": {
    "geometry": {
      "coordinates": [
        [
          [3.883775046, 7.490462162],
          [3.883808479, 7.490460663],
          [3.883810269, 7.490505883],
          [3.883776836, 7.490507382],
          [3.883775046, 7.490462162]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183543": {
    "geometry": {
      "coordinates": [
        [
          [3.883808479, 7.490460663],
          [3.883841913, 7.490459164],
          [3.883843702, 7.490504384],
          [3.883810269, 7.490505883],
          [3.883808479, 7.490460663]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183636": {
    "geometry": {
      "coordinates": [
        [
          [3.883841913, 7.490459164],
          [3.883875346, 7.490457665],
          [3.883877135, 7.490502885],
          [3.883843702, 7.490504384],
          [3.883841913, 7.490459164]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183525": {
    "geometry": {
      "coordinates": [
        [
          [3.88387749, 7.490511824],
          [3.883910923, 7.490510325],
          [3.883912712, 7.490555545],
          [3.883879279, 7.490557044],
          [3.88387749, 7.490511824]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183511": {
    "geometry": {
      "coordinates": [
        [
          [3.883844056, 7.490513323],
          [3.88387749, 7.490511824],
          [3.883879279, 7.490557044],
          [3.883845846, 7.490558543],
          [3.883844056, 7.490513323]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183613": {
    "geometry": {
      "coordinates": [
        [
          [3.883810622, 7.490514821],
          [3.883844056, 7.490513323],
          [3.883845846, 7.490558543],
          [3.883812413, 7.490560041],
          [3.883810622, 7.490514821]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183547": {
    "geometry": {
      "coordinates": [
        [
          [3.883777189, 7.490516321],
          [3.883810622, 7.490514821],
          [3.883812413, 7.490560041],
          [3.883778978, 7.490561541],
          [3.883777189, 7.490516321]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183440": {
    "geometry": {
      "coordinates": [
        [
          [3.883743756, 7.49051782],
          [3.883777189, 7.490516321],
          [3.883778978, 7.490561541],
          [3.883745545, 7.49056304],
          [3.883743756, 7.49051782]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183615": {
    "geometry": {
      "coordinates": [
        [
          [3.883710323, 7.490519319],
          [3.883743756, 7.49051782],
          [3.883745545, 7.49056304],
          [3.883712112, 7.490564539],
          [3.883710323, 7.490519319]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183465": {
    "geometry": {
      "coordinates": [
        [
          [3.883676889, 7.490520818],
          [3.883710323, 7.490519319],
          [3.883712112, 7.490564539],
          [3.883678679, 7.490566038],
          [3.883676889, 7.490520818]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183610": {
    "geometry": {
      "coordinates": [
        [
          [3.883643456, 7.490522317],
          [3.883676889, 7.490520818],
          [3.883678679, 7.490566038],
          [3.883645246, 7.490567537],
          [3.883643456, 7.490522317]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183456": {
    "geometry": {
      "coordinates": [
        [
          [3.883610022, 7.490523816],
          [3.883643456, 7.490522317],
          [3.883645246, 7.490567537],
          [3.883611812, 7.490569036],
          [3.883610022, 7.490523816]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183427": {
    "geometry": {
      "coordinates": [
        [
          [3.883576589, 7.490525315],
          [3.883610022, 7.490523816],
          [3.883611812, 7.490569036],
          [3.883578378, 7.490570535],
          [3.883576589, 7.490525315]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183542": {
    "geometry": {
      "coordinates": [
        [
          [3.883578733, 7.490579474],
          [3.883612166, 7.490577975],
          [3.883613955, 7.490623195],
          [3.883580522, 7.490624694],
          [3.883578733, 7.490579474]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183656": {
    "geometry": {
      "coordinates": [
        [
          [3.883612166, 7.490577975],
          [3.883645599, 7.490576475],
          [3.883647388, 7.490621695],
          [3.883613955, 7.490623195],
          [3.883612166, 7.490577975]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183457": {
    "geometry": {
      "coordinates": [
        [
          [3.883645599, 7.490576475],
          [3.883679032, 7.490574976],
          [3.883680822, 7.490620196],
          [3.883647388, 7.490621695],
          [3.883645599, 7.490576475]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183645": {
    "geometry": {
      "coordinates": [
        [
          [3.883679032, 7.490574976],
          [3.883712465, 7.490573477],
          [3.883714256, 7.490618697],
          [3.883680822, 7.490620196],
          [3.883679032, 7.490574976]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183536": {
    "geometry": {
      "coordinates": [
        [
          [3.883712465, 7.490573477],
          [3.883745899, 7.490571978],
          [3.883747689, 7.490617198],
          [3.883714256, 7.490618697],
          [3.883712465, 7.490573477]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183654": {
    "geometry": {
      "coordinates": [
        [
          [3.883745899, 7.490571978],
          [3.883779333, 7.490570479],
          [3.883781122, 7.490615699],
          [3.883747689, 7.490617198],
          [3.883745899, 7.490571978]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183586": {
    "geometry": {
      "coordinates": [
        [
          [3.883779333, 7.490570479],
          [3.883812766, 7.49056898],
          [3.883814555, 7.4906142],
          [3.883781122, 7.490615699],
          [3.883779333, 7.490570479]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183619": {
    "geometry": {
      "coordinates": [
        [
          [3.883812766, 7.49056898],
          [3.883846199, 7.490567481],
          [3.883847989, 7.490612701],
          [3.883814555, 7.4906142],
          [3.883812766, 7.49056898]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183591": {
    "geometry": {
      "coordinates": [
        [
          [3.883846199, 7.490567481],
          [3.883879632, 7.490565982],
          [3.883881422, 7.490611202],
          [3.883847989, 7.490612701],
          [3.883846199, 7.490567481]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183635": {
    "geometry": {
      "coordinates": [
        [
          [3.883879632, 7.490565982],
          [3.883913066, 7.490564483],
          [3.883914856, 7.490609703],
          [3.883881422, 7.490611202],
          [3.883879632, 7.490565982]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183538": {
    "geometry": {
      "coordinates": [
        [
          [3.883913066, 7.490564483],
          [3.8839465, 7.490562984],
          [3.883948289, 7.490608204],
          [3.883914856, 7.490609703],
          [3.883913066, 7.490564483]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183437": {
    "geometry": {
      "coordinates": [
        [
          [3.883881776, 7.49062014],
          [3.883915209, 7.490618641],
          [3.883916999, 7.490663861],
          [3.883883565, 7.49066536],
          [3.883881776, 7.49062014]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183596": {
    "geometry": {
      "coordinates": [
        [
          [3.883848343, 7.490621639],
          [3.883881776, 7.49062014],
          [3.883883565, 7.49066536],
          [3.883850132, 7.490666859],
          [3.883848343, 7.490621639]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183638": {
    "geometry": {
      "coordinates": [
        [
          [3.88381491, 7.490623139],
          [3.883848343, 7.490621639],
          [3.883850132, 7.490666859],
          [3.883816699, 7.490668359],
          [3.88381491, 7.490623139]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183531": {
    "geometry": {
      "coordinates": [
        [
          [3.883781475, 7.490624638],
          [3.88381491, 7.490623139],
          [3.883816699, 7.490668359],
          [3.883783266, 7.490669858],
          [3.883781475, 7.490624638]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183575": {
    "geometry": {
      "coordinates": [
        [
          [3.883748042, 7.490626136],
          [3.883781475, 7.490624638],
          [3.883783266, 7.490669858],
          [3.883749832, 7.490671357],
          [3.883748042, 7.490626136]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183509": {
    "geometry": {
      "coordinates": [
        [
          [3.883714609, 7.490627635],
          [3.883748042, 7.490626136],
          [3.883749832, 7.490671357],
          [3.883716398, 7.490672855],
          [3.883714609, 7.490627635]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183585": {
    "geometry": {
      "coordinates": [
        [
          [3.883681176, 7.490629134],
          [3.883714609, 7.490627635],
          [3.883716398, 7.490672855],
          [3.883682965, 7.490674354],
          [3.883681176, 7.490629134]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183651": {
    "geometry": {
      "coordinates": [
        [
          [3.883647743, 7.490630633],
          [3.883681176, 7.490629134],
          [3.883682965, 7.490674354],
          [3.883649532, 7.490675853],
          [3.883647743, 7.490630633]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183592": {
    "geometry": {
      "coordinates": [
        [
          [3.883614309, 7.490632133],
          [3.883647743, 7.490630633],
          [3.883649532, 7.490675853],
          [3.883616099, 7.490677353],
          [3.883614309, 7.490632133]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183630": {
    "geometry": {
      "coordinates": [
        [
          [3.883580875, 7.490633632],
          [3.883614309, 7.490632133],
          [3.883616099, 7.490677353],
          [3.883582666, 7.490678852],
          [3.883580875, 7.490633632]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183599": {
    "geometry": {
      "coordinates": [
        [
          [3.883547442, 7.490635131],
          [3.883580875, 7.490633632],
          [3.883582666, 7.490678852],
          [3.883549232, 7.490680351],
          [3.883547442, 7.490635131]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183438": {
    "geometry": {
      "coordinates": [
        [
          [3.883549586, 7.490689289],
          [3.883583019, 7.49068779],
          [3.883584808, 7.49073301],
          [3.883551375, 7.490734509],
          [3.883549586, 7.490689289]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183594": {
    "geometry": {
      "coordinates": [
        [
          [3.883583019, 7.49068779],
          [3.883616452, 7.490686291],
          [3.883618242, 7.490731511],
          [3.883584808, 7.49073301],
          [3.883583019, 7.49068779]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183446": {
    "geometry": {
      "coordinates": [
        [
          [3.883616452, 7.490686291],
          [3.883649885, 7.490684792],
          [3.883651675, 7.490730012],
          [3.883618242, 7.490731511],
          [3.883616452, 7.490686291]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183472": {
    "geometry": {
      "coordinates": [
        [
          [3.883649885, 7.490684792],
          [3.883683319, 7.490683292],
          [3.883685109, 7.490728512],
          [3.883651675, 7.490730012],
          [3.883649885, 7.490684792]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183623": {
    "geometry": {
      "coordinates": [
        [
          [3.883683319, 7.490683292],
          [3.883716753, 7.490681794],
          [3.883718542, 7.490727014],
          [3.883685109, 7.490728512],
          [3.883683319, 7.490683292]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183478": {
    "geometry": {
      "coordinates": [
        [
          [3.883716753, 7.490681794],
          [3.883750186, 7.490680295],
          [3.883751975, 7.490725515],
          [3.883718542, 7.490727014],
          [3.883716753, 7.490681794]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183558": {
    "geometry": {
      "coordinates": [
        [
          [3.883750186, 7.490680295],
          [3.883783619, 7.490678796],
          [3.883785409, 7.490724016],
          [3.883751975, 7.490725515],
          [3.883750186, 7.490680295]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183483": {
    "geometry": {
      "coordinates": [
        [
          [3.883783619, 7.490678796],
          [3.883817052, 7.490677297],
          [3.883818842, 7.490722517],
          [3.883785409, 7.490724016],
          [3.883783619, 7.490678796]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183544": {
    "geometry": {
      "coordinates": [
        [
          [3.883817052, 7.490677297],
          [3.883850486, 7.490675798],
          [3.883852276, 7.490721018],
          [3.883818842, 7.490722517],
          [3.883817052, 7.490677297]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183588": {
    "geometry": {
      "coordinates": [
        [
          [3.883850486, 7.490675798],
          [3.88388392, 7.490674298],
          [3.883885709, 7.490719518],
          [3.883852276, 7.490721018],
          [3.883850486, 7.490675798]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183464": {
    "geometry": {
      "coordinates": [
        [
          [3.88388392, 7.490674298],
          [3.883917353, 7.490672799],
          [3.883919142, 7.490718019],
          [3.883885709, 7.490719518],
          [3.88388392, 7.490674298]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183597": {
    "geometry": {
      "coordinates": [
        [
          [3.883886062, 7.490728457],
          [3.883919496, 7.490726958],
          [3.883921285, 7.490772178],
          [3.883887852, 7.490773677],
          [3.883886062, 7.490728457]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183484": {
    "geometry": {
      "coordinates": [
        [
          [3.883852629, 7.490729956],
          [3.883886062, 7.490728457],
          [3.883887852, 7.490773677],
          [3.883854419, 7.490775176],
          [3.883852629, 7.490729956]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183602": {
    "geometry": {
      "coordinates": [
        [
          [3.883819196, 7.490731455],
          [3.883852629, 7.490729956],
          [3.883854419, 7.490775176],
          [3.883820985, 7.490776675],
          [3.883819196, 7.490731455]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183505": {
    "geometry": {
      "coordinates": [
        [
          [3.883785763, 7.490732954],
          [3.883819196, 7.490731455],
          [3.883820985, 7.490776675],
          [3.883787552, 7.490778174],
          [3.883785763, 7.490732954]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183600": {
    "geometry": {
      "coordinates": [
        [
          [3.883752329, 7.490734453],
          [3.883785763, 7.490732954],
          [3.883787552, 7.490778174],
          [3.883754119, 7.490779673],
          [3.883752329, 7.490734453]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183431": {
    "geometry": {
      "coordinates": [
        [
          [3.883718895, 7.490735952],
          [3.883752329, 7.490734453],
          [3.883754119, 7.490779673],
          [3.883720685, 7.490781172],
          [3.883718895, 7.490735952]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183555": {
    "geometry": {
      "coordinates": [
        [
          [3.883685462, 7.490737452],
          [3.883718895, 7.490735952],
          [3.883720685, 7.490781172],
          [3.883687252, 7.490782672],
          [3.883685462, 7.490737452]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183480": {
    "geometry": {
      "coordinates": [
        [
          [3.883652029, 7.49073895],
          [3.883685462, 7.490737452],
          [3.883687252, 7.490782672],
          [3.883653818, 7.49078417],
          [3.883652029, 7.49073895]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183556": {
    "geometry": {
      "coordinates": [
        [
          [3.883618596, 7.490740449],
          [3.883652029, 7.49073895],
          [3.883653818, 7.49078417],
          [3.883620385, 7.490785669],
          [3.883618596, 7.490740449]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183620": {
    "geometry": {
      "coordinates": [
        [
          [3.883585163, 7.490741948],
          [3.883618596, 7.490740449],
          [3.883620385, 7.490785669],
          [3.883586952, 7.490787168],
          [3.883585163, 7.490741948]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183482": {
    "geometry": {
      "coordinates": [
        [
          [3.883551728, 7.490743447],
          [3.883585163, 7.490741948],
          [3.883586952, 7.490787168],
          [3.883553519, 7.490788667],
          [3.883551728, 7.490743447]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183579": {
    "geometry": {
      "coordinates": [
        [
          [3.883553872, 7.490797605],
          [3.883587305, 7.490796106],
          [3.883589095, 7.490841326],
          [3.883555662, 7.490842825],
          [3.883553872, 7.490797605]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183460": {
    "geometry": {
      "coordinates": [
        [
          [3.883587305, 7.490796106],
          [3.883620739, 7.490794608],
          [3.883622529, 7.490839828],
          [3.883589095, 7.490841326],
          [3.883587305, 7.490796106]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183522": {
    "geometry": {
      "coordinates": [
        [
          [3.883620739, 7.490794608],
          [3.883654173, 7.490793109],
          [3.883655962, 7.490838329],
          [3.883622529, 7.490839828],
          [3.883620739, 7.490794608]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183548": {
    "geometry": {
      "coordinates": [
        [
          [3.883654173, 7.490793109],
          [3.883687606, 7.49079161],
          [3.883689395, 7.49083683],
          [3.883655962, 7.490838329],
          [3.883654173, 7.490793109]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183477": {
    "geometry": {
      "coordinates": [
        [
          [3.883687606, 7.49079161],
          [3.883721039, 7.49079011],
          [3.883722829, 7.49083533],
          [3.883689395, 7.49083683],
          [3.883687606, 7.49079161]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183494": {
    "geometry": {
      "coordinates": [
        [
          [3.883721039, 7.49079011],
          [3.883754472, 7.490788611],
          [3.883756262, 7.490833831],
          [3.883722829, 7.49083533],
          [3.883721039, 7.49079011]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183621": {
    "geometry": {
      "coordinates": [
        [
          [3.883754472, 7.490788611],
          [3.883787906, 7.490787112],
          [3.883789695, 7.490832332],
          [3.883756262, 7.490833831],
          [3.883754472, 7.490788611]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183439": {
    "geometry": {
      "coordinates": [
        [
          [3.883787906, 7.490787112],
          [3.883821339, 7.490785613],
          [3.883823129, 7.490830833],
          [3.883789695, 7.490832332],
          [3.883787906, 7.490787112]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183643": {
    "geometry": {
      "coordinates": [
        [
          [3.883821339, 7.490785613],
          [3.883854773, 7.490784114],
          [3.883856562, 7.490829335],
          [3.883823129, 7.490830833],
          [3.883821339, 7.490785613]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183481": {
    "geometry": {
      "coordinates": [
        [
          [3.883854773, 7.490784114],
          [3.883888206, 7.490782616],
          [3.883889996, 7.490827836],
          [3.883856562, 7.490829335],
          [3.883854773, 7.490784114]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183577": {
    "geometry": {
      "coordinates": [
        [
          [3.883888206, 7.490782616],
          [3.883921639, 7.490781116],
          [3.883923429, 7.490826336],
          [3.883889996, 7.490827836],
          [3.883888206, 7.490782616]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183606": {
    "geometry": {
      "coordinates": [
        [
          [3.883890349, 7.490836774],
          [3.883923783, 7.490835275],
          [3.883925572, 7.490880495],
          [3.883892139, 7.490881994],
          [3.883890349, 7.490836774]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183453": {
    "geometry": {
      "coordinates": [
        [
          [3.883856916, 7.490838273],
          [3.883890349, 7.490836774],
          [3.883892139, 7.490881994],
          [3.883858705, 7.490883493],
          [3.883856916, 7.490838273]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183428": {
    "geometry": {
      "coordinates": [
        [
          [3.883823482, 7.490839772],
          [3.883856916, 7.490838273],
          [3.883858705, 7.490883493],
          [3.883825272, 7.490884992],
          [3.883823482, 7.490839772]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183573": {
    "geometry": {
      "coordinates": [
        [
          [3.883790049, 7.49084127],
          [3.883823482, 7.490839772],
          [3.883825272, 7.490884992],
          [3.883791839, 7.49088649],
          [3.883790049, 7.49084127]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183562": {
    "geometry": {
      "coordinates": [
        [
          [3.883756616, 7.490842769],
          [3.883790049, 7.49084127],
          [3.883791839, 7.49088649],
          [3.883758405, 7.490887989],
          [3.883756616, 7.490842769]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183461": {
    "geometry": {
      "coordinates": [
        [
          [3.883723182, 7.490844269],
          [3.883756616, 7.490842769],
          [3.883758405, 7.490887989],
          [3.883724972, 7.490889489],
          [3.883723182, 7.490844269]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183649": {
    "geometry": {
      "coordinates": [
        [
          [3.883689749, 7.490845768],
          [3.883723182, 7.490844269],
          [3.883724972, 7.490889489],
          [3.883691538, 7.490890988],
          [3.883689749, 7.490845768]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183445": {
    "geometry": {
      "coordinates": [
        [
          [3.883656315, 7.490847267],
          [3.883689749, 7.490845768],
          [3.883691538, 7.490890988],
          [3.883658105, 7.490892487],
          [3.883656315, 7.490847267]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183526": {
    "geometry": {
      "coordinates": [
        [
          [3.883622882, 7.490848766],
          [3.883656315, 7.490847267],
          [3.883658105, 7.490892487],
          [3.883624672, 7.490893986],
          [3.883622882, 7.490848766]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183589": {
    "geometry": {
      "coordinates": [
        [
          [3.883589449, 7.490850265],
          [3.883622882, 7.490848766],
          [3.883624672, 7.490893986],
          [3.883591238, 7.490895485],
          [3.883589449, 7.490850265]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183534": {
    "geometry": {
      "coordinates": [
        [
          [3.883556016, 7.490851764],
          [3.883589449, 7.490850265],
          [3.883591238, 7.490895485],
          [3.883557805, 7.490896984],
          [3.883556016, 7.490851764]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183552": {
    "geometry": {
      "coordinates": [
        [
          [3.883558159, 7.490905923],
          [3.883591592, 7.490904423],
          [3.883593382, 7.490949643],
          [3.883559948, 7.490951143],
          [3.883558159, 7.490905923]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183611": {
    "geometry": {
      "coordinates": [
        [
          [3.883591592, 7.490904423],
          [3.883625026, 7.490902924],
          [3.883626815, 7.490948144],
          [3.883593382, 7.490949643],
          [3.883591592, 7.490904423]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183479": {
    "geometry": {
      "coordinates": [
        [
          [3.883625026, 7.490902924],
          [3.883658459, 7.490901425],
          [3.883660249, 7.490946645],
          [3.883626815, 7.490948144],
          [3.883625026, 7.490902924]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183432": {
    "geometry": {
      "coordinates": [
        [
          [3.883658459, 7.490901425],
          [3.883691892, 7.490899926],
          [3.883693682, 7.490945146],
          [3.883660249, 7.490946645],
          [3.883658459, 7.490901425]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183563": {
    "geometry": {
      "coordinates": [
        [
          [3.883691892, 7.490899926],
          [3.883725326, 7.490898427],
          [3.883727115, 7.490943647],
          [3.883693682, 7.490945146],
          [3.883691892, 7.490899926]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183517": {
    "geometry": {
      "coordinates": [
        [
          [3.883725326, 7.490898427],
          [3.883758759, 7.490896928],
          [3.883760548, 7.490942148],
          [3.883727115, 7.490943647],
          [3.883725326, 7.490898427]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183641": {
    "geometry": {
      "coordinates": [
        [
          [3.883758759, 7.490896928],
          [3.883792192, 7.490895429],
          [3.883793982, 7.490940649],
          [3.883760548, 7.490942148],
          [3.883758759, 7.490896928]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183462": {
    "geometry": {
      "coordinates": [
        [
          [3.883792192, 7.490895429],
          [3.883825626, 7.49089393],
          [3.883827416, 7.49093915],
          [3.883793982, 7.490940649],
          [3.883792192, 7.490895429]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183576": {
    "geometry": {
      "coordinates": [
        [
          [3.883825626, 7.49089393],
          [3.883859059, 7.490892431],
          [3.883860849, 7.490937651],
          [3.883827416, 7.49093915],
          [3.883825626, 7.49089393]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183560": {
    "geometry": {
      "coordinates": [
        [
          [3.883859059, 7.490892431],
          [3.883892493, 7.490890932],
          [3.883894282, 7.490936152],
          [3.883860849, 7.490937651],
          [3.883859059, 7.490892431]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183451": {
    "geometry": {
      "coordinates": [
        [
          [3.883892493, 7.490890932],
          [3.883925926, 7.490889433],
          [3.883927715, 7.490934653],
          [3.883894282, 7.490936152],
          [3.883892493, 7.490890932]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183493": {
    "geometry": {
      "coordinates": [
        [
          [3.883894636, 7.49094509],
          [3.883928069, 7.490943591],
          [3.883929859, 7.490988811],
          [3.883896426, 7.49099031],
          [3.883894636, 7.49094509]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183653": {
    "geometry": {
      "coordinates": [
        [
          [3.883861202, 7.490946589],
          [3.883894636, 7.49094509],
          [3.883896426, 7.49099031],
          [3.883862992, 7.490991809],
          [3.883861202, 7.490946589]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183504": {
    "geometry": {
      "coordinates": [
        [
          [3.883827769, 7.490948088],
          [3.883861202, 7.490946589],
          [3.883862992, 7.490991809],
          [3.883829558, 7.490993308],
          [3.883827769, 7.490948088]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183567": {
    "geometry": {
      "coordinates": [
        [
          [3.883794336, 7.490949588],
          [3.883827769, 7.490948088],
          [3.883829558, 7.490993308],
          [3.883796125, 7.490994808],
          [3.883794336, 7.490949588]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183470": {
    "geometry": {
      "coordinates": [
        [
          [3.883760902, 7.490951087],
          [3.883794336, 7.490949588],
          [3.883796125, 7.490994808],
          [3.883762692, 7.490996307],
          [3.883760902, 7.490951087]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183561": {
    "geometry": {
      "coordinates": [
        [
          [3.883727469, 7.490952586],
          [3.883760902, 7.490951087],
          [3.883762692, 7.490996307],
          [3.883729259, 7.490997806],
          [3.883727469, 7.490952586]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183607": {
    "geometry": {
      "coordinates": [
        [
          [3.883694036, 7.490954084],
          [3.883727469, 7.490952586],
          [3.883729259, 7.490997806],
          [3.883695825, 7.490999304],
          [3.883694036, 7.490954084]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183537": {
    "geometry": {
      "coordinates": [
        [
          [3.883660602, 7.490955583],
          [3.883694036, 7.490954084],
          [3.883695825, 7.490999304],
          [3.883662391, 7.491000803],
          [3.883660602, 7.490955583]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183430": {
    "geometry": {
      "coordinates": [
        [
          [3.883627169, 7.490957082],
          [3.883660602, 7.490955583],
          [3.883662391, 7.491000803],
          [3.883628958, 7.491002302],
          [3.883627169, 7.490957082]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183550": {
    "geometry": {
      "coordinates": [
        [
          [3.883593735, 7.490958582],
          [3.883627169, 7.490957082],
          [3.883628958, 7.491002302],
          [3.883595525, 7.491003802],
          [3.883593735, 7.490958582]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183616": {
    "geometry": {
      "coordinates": [
        [
          [3.883560302, 7.490960081],
          [3.883593735, 7.490958582],
          [3.883595525, 7.491003802],
          [3.883562092, 7.491005301],
          [3.883560302, 7.490960081]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183521": {
    "geometry": {
      "coordinates": [
        [
          [3.883562445, 7.491014239],
          [3.883595879, 7.49101274],
          [3.883597668, 7.49105796],
          [3.883564235, 7.491059459],
          [3.883562445, 7.491014239]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183631": {
    "geometry": {
      "coordinates": [
        [
          [3.883595879, 7.49101274],
          [3.883629312, 7.49101124],
          [3.883631102, 7.49105646],
          [3.883597668, 7.49105796],
          [3.883595879, 7.49101274]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183583": {
    "geometry": {
      "coordinates": [
        [
          [3.883629312, 7.49101124],
          [3.883662746, 7.491009742],
          [3.883664535, 7.491054962],
          [3.883631102, 7.49105646],
          [3.883629312, 7.49101124]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183516": {
    "geometry": {
      "coordinates": [
        [
          [3.883662746, 7.491009742],
          [3.883696179, 7.491008243],
          [3.883697968, 7.491053463],
          [3.883664535, 7.491054962],
          [3.883662746, 7.491009742]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183435": {
    "geometry": {
      "coordinates": [
        [
          [3.883696179, 7.491008243],
          [3.883729612, 7.491006744],
          [3.883731401, 7.491051964],
          [3.883697968, 7.491053463],
          [3.883696179, 7.491008243]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183527": {
    "geometry": {
      "coordinates": [
        [
          [3.883729612, 7.491006744],
          [3.883763045, 7.491005245],
          [3.883764836, 7.491050465],
          [3.883731401, 7.491051964],
          [3.883729612, 7.491006744]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183426": {
    "geometry": {
      "coordinates": [
        [
          [3.883763045, 7.491005245],
          [3.883796479, 7.491003746],
          [3.883798269, 7.491048966],
          [3.883764836, 7.491050465],
          [3.883763045, 7.491005245]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183614": {
    "geometry": {
      "coordinates": [
        [
          [3.883796479, 7.491003746],
          [3.883829913, 7.491002246],
          [3.883831702, 7.491047466],
          [3.883798269, 7.491048966],
          [3.883796479, 7.491003746]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183489": {
    "geometry": {
      "coordinates": [
        [
          [3.883829913, 7.491002246],
          [3.883863346, 7.491000747],
          [3.883865135, 7.491045967],
          [3.883831702, 7.491047466],
          [3.883829913, 7.491002246]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183628": {
    "geometry": {
      "coordinates": [
        [
          [3.883863346, 7.491000747],
          [3.883896779, 7.490999248],
          [3.883898568, 7.491044468],
          [3.883865135, 7.491045967],
          [3.883863346, 7.491000747]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183518": {
    "geometry": {
      "coordinates": [
        [
          [3.883896779, 7.490999248],
          [3.883930212, 7.49099775],
          [3.883932002, 7.49104297],
          [3.883898568, 7.491044468],
          [3.883896779, 7.490999248]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183659": {
    "geometry": {
      "coordinates": [
        [
          [3.883898923, 7.491053407],
          [3.883932356, 7.491051908],
          [3.883934145, 7.491097128],
          [3.883900712, 7.491098627],
          [3.883898923, 7.491053407]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183581": {
    "geometry": {
      "coordinates": [
        [
          [3.883865489, 7.491054906],
          [3.883898923, 7.491053407],
          [3.883900712, 7.491098627],
          [3.883867279, 7.491100126],
          [3.883865489, 7.491054906]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183618": {
    "geometry": {
      "coordinates": [
        [
          [3.883832055, 7.491056405],
          [3.883865489, 7.491054906],
          [3.883867279, 7.491100126],
          [3.883833846, 7.491101625],
          [3.883832055, 7.491056405]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183502": {
    "geometry": {
      "coordinates": [
        [
          [3.883798622, 7.491057904],
          [3.883832055, 7.491056405],
          [3.883833846, 7.491101625],
          [3.883800412, 7.491103124],
          [3.883798622, 7.491057904]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183605": {
    "geometry": {
      "coordinates": [
        [
          [3.883765189, 7.491059403],
          [3.883798622, 7.491057904],
          [3.883800412, 7.491103124],
          [3.883766978, 7.491104623],
          [3.883765189, 7.491059403]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183476": {
    "geometry": {
      "coordinates": [
        [
          [3.883731756, 7.491060902],
          [3.883765189, 7.491059403],
          [3.883766978, 7.491104623],
          [3.883733545, 7.491106122],
          [3.883731756, 7.491060902]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183468": {
    "geometry": {
      "coordinates": [
        [
          [3.883698322, 7.491062401],
          [3.883731756, 7.491060902],
          [3.883733545, 7.491106122],
          [3.883700112, 7.491107621],
          [3.883698322, 7.491062401]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183488": {
    "geometry": {
      "coordinates": [
        [
          [3.883664889, 7.4910639],
          [3.883698322, 7.491062401],
          [3.883700112, 7.491107621],
          [3.883666679, 7.49110912],
          [3.883664889, 7.4910639]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183514": {
    "geometry": {
      "coordinates": [
        [
          [3.883631455, 7.4910654],
          [3.883664889, 7.4910639],
          [3.883666679, 7.49110912],
          [3.883633245, 7.49111062],
          [3.883631455, 7.4910654]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183609": {
    "geometry": {
      "coordinates": [
        [
          [3.883598022, 7.491066898],
          [3.883631455, 7.4910654],
          [3.883633245, 7.49111062],
          [3.883599811, 7.491112118],
          [3.883598022, 7.491066898]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183572": {
    "geometry": {
      "coordinates": [
        [
          [3.883564589, 7.491068397],
          [3.883598022, 7.491066898],
          [3.883599811, 7.491112118],
          [3.883566378, 7.491113617],
          [3.883564589, 7.491068397]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183632": {
    "geometry": {
      "coordinates": [
        [
          [3.883566732, 7.491122555],
          [3.883600165, 7.491121057],
          [3.883601955, 7.491166277],
          [3.883568522, 7.491167776],
          [3.883566732, 7.491122555]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183608": {
    "geometry": {
      "coordinates": [
        [
          [3.883600165, 7.491121057],
          [3.883633599, 7.491119558],
          [3.883635388, 7.491164778],
          [3.883601955, 7.491166277],
          [3.883600165, 7.491121057]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183508": {
    "geometry": {
      "coordinates": [
        [
          [3.883633599, 7.491119558],
          [3.883667032, 7.491118059],
          [3.883668821, 7.491163279],
          [3.883635388, 7.491164778],
          [3.883633599, 7.491119558]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183650": {
    "geometry": {
      "coordinates": [
        [
          [3.883667032, 7.491118059],
          [3.883700465, 7.491116559],
          [3.883702255, 7.491161779],
          [3.883668821, 7.491163279],
          [3.883667032, 7.491118059]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183495": {
    "geometry": {
      "coordinates": [
        [
          [3.883700465, 7.491116559],
          [3.883733898, 7.49111506],
          [3.883735689, 7.49116028],
          [3.883702255, 7.491161779],
          [3.883700465, 7.491116559]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183455": {
    "geometry": {
      "coordinates": [
        [
          [3.883733898, 7.49111506],
          [3.883767333, 7.491113561],
          [3.883769122, 7.491158781],
          [3.883735689, 7.49116028],
          [3.883733898, 7.49111506]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183582": {
    "geometry": {
      "coordinates": [
        [
          [3.883767333, 7.491113561],
          [3.883800766, 7.491112062],
          [3.883802555, 7.491157282],
          [3.883769122, 7.491158781],
          [3.883767333, 7.491113561]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183626": {
    "geometry": {
      "coordinates": [
        [
          [3.883800766, 7.491112062],
          [3.883834199, 7.491110564],
          [3.883835988, 7.491155784],
          [3.883802555, 7.491157282],
          [3.883800766, 7.491112062]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183452": {
    "geometry": {
      "coordinates": [
        [
          [3.883834199, 7.491110564],
          [3.883867632, 7.491109065],
          [3.883869422, 7.491154285],
          [3.883835988, 7.491155784],
          [3.883834199, 7.491110564]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183568": {
    "geometry": {
      "coordinates": [
        [
          [3.883867632, 7.491109065],
          [3.883901065, 7.491107565],
          [3.883902856, 7.491152785],
          [3.883869422, 7.491154285],
          [3.883867632, 7.491109065]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183474": {
    "geometry": {
      "coordinates": [
        [
          [3.883901065, 7.491107565],
          [3.8839345, 7.491106066],
          [3.883936289, 7.491151286],
          [3.883902856, 7.491152785],
          [3.883901065, 7.491107565]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183524": {
    "geometry": {
      "coordinates": [
        [
          [3.883903209, 7.491161723],
          [3.883936642, 7.491160224],
          [3.883938432, 7.491205444],
          [3.883904999, 7.491206943],
          [3.883903209, 7.491161723]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183627": {
    "geometry": {
      "coordinates": [
        [
          [3.883869776, 7.491163223],
          [3.883903209, 7.491161723],
          [3.883904999, 7.491206943],
          [3.883871565, 7.491208443],
          [3.883869776, 7.491163223]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183617": {
    "geometry": {
      "coordinates": [
        [
          [3.883836343, 7.491164722],
          [3.883869776, 7.491163223],
          [3.883871565, 7.491208443],
          [3.883838132, 7.491209942],
          [3.883836343, 7.491164722]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183463": {
    "geometry": {
      "coordinates": [
        [
          [3.883802909, 7.491166221],
          [3.883836343, 7.491164722],
          [3.883838132, 7.491209942],
          [3.883804699, 7.491211441],
          [3.883802909, 7.491166221]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183634": {
    "geometry": {
      "coordinates": [
        [
          [3.883769475, 7.49116772],
          [3.883802909, 7.491166221],
          [3.883804699, 7.491211441],
          [3.883771265, 7.49121294],
          [3.883769475, 7.49116772]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183528": {
    "geometry": {
      "coordinates": [
        [
          [3.883736042, 7.491169218],
          [3.883769475, 7.49116772],
          [3.883771265, 7.49121294],
          [3.883737832, 7.491214438],
          [3.883736042, 7.491169218]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183529": {
    "geometry": {
      "coordinates": [
        [
          [3.883702609, 7.491170718],
          [3.883736042, 7.491169218],
          [3.883737832, 7.491214438],
          [3.883704398, 7.491215938],
          [3.883702609, 7.491170718]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183443": {
    "geometry": {
      "coordinates": [
        [
          [3.883669176, 7.491172217],
          [3.883702609, 7.491170718],
          [3.883704398, 7.491215938],
          [3.883670965, 7.491217437],
          [3.883669176, 7.491172217]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183554": {
    "geometry": {
      "coordinates": [
        [
          [3.883635742, 7.491173716],
          [3.883669176, 7.491172217],
          [3.883670965, 7.491217437],
          [3.883637532, 7.491218936],
          [3.883635742, 7.491173716]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183450": {
    "geometry": {
      "coordinates": [
        [
          [3.883602308, 7.491175215],
          [3.883635742, 7.491173716],
          [3.883637532, 7.491218936],
          [3.883604099, 7.491220435],
          [3.883602308, 7.491175215]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183658": {
    "geometry": {
      "coordinates": [
        [
          [3.883568875, 7.491176714],
          [3.883602308, 7.491175215],
          [3.883604099, 7.491220435],
          [3.883570664, 7.491221934],
          [3.883568875, 7.491176714]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183486": {
    "geometry": {
      "coordinates": [
        [
          [3.883571019, 7.491230872],
          [3.883604452, 7.491229373],
          [3.883606241, 7.491274593],
          [3.883572808, 7.491276092],
          [3.883571019, 7.491230872]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183603": {
    "geometry": {
      "coordinates": [
        [
          [3.883604452, 7.491229373],
          [3.883637885, 7.491227874],
          [3.883639675, 7.491273094],
          [3.883606241, 7.491274593],
          [3.883604452, 7.491229373]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183574": {
    "geometry": {
      "coordinates": [
        [
          [3.883637885, 7.491227874],
          [3.883671318, 7.491226375],
          [3.883673108, 7.491271595],
          [3.883639675, 7.491273094],
          [3.883637885, 7.491227874]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183500": {
    "geometry": {
      "coordinates": [
        [
          [3.883671318, 7.491226375],
          [3.883704752, 7.491224876],
          [3.883706542, 7.491270096],
          [3.883673108, 7.491271595],
          [3.883671318, 7.491226375]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183657": {
    "geometry": {
      "coordinates": [
        [
          [3.883704752, 7.491224876],
          [3.883738186, 7.491223377],
          [3.883739975, 7.491268597],
          [3.883706542, 7.491270096],
          [3.883704752, 7.491224876]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183541": {
    "geometry": {
      "coordinates": [
        [
          [3.883738186, 7.491223377],
          [3.883771619, 7.491221878],
          [3.883773408, 7.491267098],
          [3.883739975, 7.491268597],
          [3.883738186, 7.491223377]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183661": {
    "geometry": {
      "coordinates": [
        [
          [3.883771619, 7.491221878],
          [3.883805052, 7.491220379],
          [3.883806842, 7.491265599],
          [3.883773408, 7.491267098],
          [3.883771619, 7.491221878]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183507": {
    "geometry": {
      "coordinates": [
        [
          [3.883805052, 7.491220379],
          [3.883838485, 7.49121888],
          [3.883840275, 7.4912641],
          [3.883806842, 7.491265599],
          [3.883805052, 7.491220379]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183593": {
    "geometry": {
      "coordinates": [
        [
          [3.883838485, 7.49121888],
          [3.883871919, 7.491217381],
          [3.883873709, 7.491262601],
          [3.883840275, 7.4912641],
          [3.883838485, 7.49121888]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183578": {
    "geometry": {
      "coordinates": [
        [
          [3.883871919, 7.491217381],
          [3.883905353, 7.491215882],
          [3.883907142, 7.491261102],
          [3.883873709, 7.491262601],
          [3.883871919, 7.491217381]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183454": {
    "geometry": {
      "coordinates": [
        [
          [3.883905353, 7.491215882],
          [3.883938786, 7.491214382],
          [3.883940576, 7.491259602],
          [3.883907142, 7.491261102],
          [3.883905353, 7.491215882]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183530": {
    "geometry": {
      "coordinates": [
        [
          [3.883907496, 7.49127004],
          [3.883940929, 7.491268541],
          [3.883942718, 7.491313762],
          [3.883909285, 7.49131526],
          [3.883907496, 7.49127004]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183625": {
    "geometry": {
      "coordinates": [
        [
          [3.883874062, 7.491271539],
          [3.883907496, 7.49127004],
          [3.883909285, 7.49131526],
          [3.883875852, 7.491316759],
          [3.883874062, 7.491271539]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183510": {
    "geometry": {
      "coordinates": [
        [
          [3.883840629, 7.491273038],
          [3.883874062, 7.491271539],
          [3.883875852, 7.491316759],
          [3.883842419, 7.491318258],
          [3.883840629, 7.491273038]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183553": {
    "geometry": {
      "coordinates": [
        [
          [3.883807196, 7.491274537],
          [3.883840629, 7.491273038],
          [3.883842419, 7.491318258],
          [3.883808985, 7.491319757],
          [3.883807196, 7.491274537]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183551": {
    "geometry": {
      "coordinates": [
        [
          [3.883773762, 7.491276036],
          [3.883807196, 7.491274537],
          [3.883808985, 7.491319757],
          [3.883775552, 7.491321256],
          [3.883773762, 7.491276036]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183519": {
    "geometry": {
      "coordinates": [
        [
          [3.883740329, 7.491277536],
          [3.883773762, 7.491276036],
          [3.883775552, 7.491321256],
          [3.883742118, 7.491322756],
          [3.883740329, 7.491277536]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183557": {
    "geometry": {
      "coordinates": [
        [
          [3.883706895, 7.491279035],
          [3.883740329, 7.491277536],
          [3.883742118, 7.491322756],
          [3.883708685, 7.491324255],
          [3.883706895, 7.491279035]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183648": {
    "geometry": {
      "coordinates": [
        [
          [3.883673462, 7.491280534],
          [3.883706895, 7.491279035],
          [3.883708685, 7.491324255],
          [3.883675251, 7.491325754],
          [3.883673462, 7.491280534]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183501": {
    "geometry": {
      "coordinates": [
        [
          [3.883640029, 7.491282032],
          [3.883673462, 7.491280534],
          [3.883675251, 7.491325754],
          [3.883641818, 7.491327252],
          [3.883640029, 7.491282032]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183644": {
    "geometry": {
      "coordinates": [
        [
          [3.883606596, 7.491283531],
          [3.883640029, 7.491282032],
          [3.883641818, 7.491327252],
          [3.883608385, 7.491328751],
          [3.883606596, 7.491283531]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183492": {
    "geometry": {
      "coordinates": [
        [
          [3.883573161, 7.49128503],
          [3.883606596, 7.491283531],
          [3.883608385, 7.491328751],
          [3.883574952, 7.49133025],
          [3.883573161, 7.49128503]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183513": {
    "geometry": {
      "coordinates": [
        [
          [3.883541872, 7.491340688],
          [3.883575305, 7.491339189],
          [3.883577094, 7.491384409],
          [3.883543661, 7.491385908],
          [3.883541872, 7.491340688]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183601": {
    "geometry": {
      "coordinates": [
        [
          [3.883575305, 7.491339189],
          [3.883608738, 7.491337689],
          [3.883610528, 7.49138291],
          [3.883577094, 7.491384409],
          [3.883575305, 7.491339189]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183569": {
    "geometry": {
      "coordinates": [
        [
          [3.883608738, 7.491337689],
          [3.883642172, 7.491336191],
          [3.883643962, 7.491381411],
          [3.883610528, 7.49138291],
          [3.883608738, 7.491337689]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183442": {
    "geometry": {
      "coordinates": [
        [
          [3.883642172, 7.491336191],
          [3.883675606, 7.491334692],
          [3.883677395, 7.491379912],
          [3.883643962, 7.491381411],
          [3.883642172, 7.491336191]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183506": {
    "geometry": {
      "coordinates": [
        [
          [3.883675606, 7.491334692],
          [3.883709039, 7.491333193],
          [3.883710828, 7.491378413],
          [3.883677395, 7.491379912],
          [3.883675606, 7.491334692]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183622": {
    "geometry": {
      "coordinates": [
        [
          [3.883709039, 7.491333193],
          [3.883742472, 7.491331694],
          [3.883744262, 7.491376914],
          [3.883710828, 7.491378413],
          [3.883709039, 7.491333193]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183549": {
    "geometry": {
      "coordinates": [
        [
          [3.883742472, 7.491331694],
          [3.883775905, 7.491330195],
          [3.883777695, 7.491375415],
          [3.883744262, 7.491376914],
          [3.883742472, 7.491331694]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183444": {
    "geometry": {
      "coordinates": [
        [
          [3.883775905, 7.491330195],
          [3.883809339, 7.491328695],
          [3.883811128, 7.491373915],
          [3.883777695, 7.491375415],
          [3.883775905, 7.491330195]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183539": {
    "geometry": {
      "coordinates": [
        [
          [3.883809339, 7.491328695],
          [3.883842772, 7.491327196],
          [3.883844562, 7.491372416],
          [3.883811128, 7.491373915],
          [3.883809339, 7.491328695]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183660": {
    "geometry": {
      "coordinates": [
        [
          [3.883842772, 7.491327196],
          [3.883876206, 7.491325698],
          [3.883877996, 7.491370918],
          [3.883844562, 7.491372416],
          [3.883842772, 7.491327196]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183466": {
    "geometry": {
      "coordinates": [
        [
          [3.883876206, 7.491325698],
          [3.883909639, 7.491324199],
          [3.883911429, 7.491369419],
          [3.883877996, 7.491370918],
          [3.883876206, 7.491325698]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183487": {
    "geometry": {
      "coordinates": [
        [
          [3.883844916, 7.491381355],
          [3.883878349, 7.491379856],
          [3.883880138, 7.491425076],
          [3.883846705, 7.491426575],
          [3.883844916, 7.491381355]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183469": {
    "geometry": {
      "coordinates": [
        [
          [3.883811482, 7.491382853],
          [3.883844916, 7.491381355],
          [3.883846705, 7.491426575],
          [3.883813272, 7.491428074],
          [3.883811482, 7.491382853]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183433": {
    "geometry": {
      "coordinates": [
        [
          [3.883778049, 7.491384353],
          [3.883811482, 7.491382853],
          [3.883813272, 7.491428074],
          [3.883779839, 7.491429573],
          [3.883778049, 7.491384353]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183564": {
    "geometry": {
      "coordinates": [
        [
          [3.883744615, 7.491385852],
          [3.883778049, 7.491384353],
          [3.883779839, 7.491429573],
          [3.883746405, 7.491431072],
          [3.883744615, 7.491385852]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183499": {
    "geometry": {
      "coordinates": [
        [
          [3.883711182, 7.491387351],
          [3.883744615, 7.491385852],
          [3.883746405, 7.491431072],
          [3.883712971, 7.491432571],
          [3.883711182, 7.491387351]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183467": {
    "geometry": {
      "coordinates": [
        [
          [3.883677748, 7.49138885],
          [3.883711182, 7.491387351],
          [3.883712971, 7.491432571],
          [3.883679538, 7.49143407],
          [3.883677748, 7.49138885]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183485": {
    "geometry": {
      "coordinates": [
        [
          [3.883644315, 7.491390349],
          [3.883677748, 7.49138885],
          [3.883679538, 7.49143407],
          [3.883646105, 7.491435569],
          [3.883644315, 7.491390349]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183633": {
    "geometry": {
      "coordinates": [
        [
          [3.883610882, 7.491391849],
          [3.883644315, 7.491390349],
          [3.883646105, 7.491435569],
          [3.883612671, 7.491437069],
          [3.883610882, 7.491391849]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183429": {
    "geometry": {
      "coordinates": [
        [
          [3.883577449, 7.491393347],
          [3.883610882, 7.491391849],
          [3.883612671, 7.491437069],
          [3.883579238, 7.491438568],
          [3.883577449, 7.491393347]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183571": {
    "geometry": {
      "coordinates": [
        [
          [3.883544014, 7.491394846],
          [3.883577449, 7.491393347],
          [3.883579238, 7.491438568],
          [3.883545805, 7.491440066],
          [3.883544014, 7.491394846]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183459": {
    "geometry": {
      "coordinates": [
        [
          [3.883579591, 7.491447506],
          [3.883613025, 7.491446007],
          [3.883614815, 7.491491227],
          [3.883581381, 7.491492726],
          [3.883579591, 7.491447506]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183533": {
    "geometry": {
      "coordinates": [
        [
          [3.883613025, 7.491446007],
          [3.883646459, 7.491444507],
          [3.883648248, 7.491489727],
          [3.883614815, 7.491491227],
          [3.883613025, 7.491446007]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183587": {
    "geometry": {
      "coordinates": [
        [
          [3.883646459, 7.491444507],
          [3.883679892, 7.491443008],
          [3.883681682, 7.491488228],
          [3.883648248, 7.491489727],
          [3.883646459, 7.491444507]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183473": {
    "geometry": {
      "coordinates": [
        [
          [3.883679892, 7.491443008],
          [3.883713325, 7.491441509],
          [3.883715115, 7.491486729],
          [3.883681682, 7.491488228],
          [3.883679892, 7.491443008]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183523": {
    "geometry": {
      "coordinates": [
        [
          [3.883713325, 7.491441509],
          [3.883746759, 7.49144001],
          [3.883748548, 7.49148523],
          [3.883715115, 7.491486729],
          [3.883713325, 7.491441509]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183647": {
    "geometry": {
      "coordinates": [
        [
          [3.883746759, 7.49144001],
          [3.883780192, 7.491438512],
          [3.883781981, 7.491483732],
          [3.883748548, 7.49148523],
          [3.883746759, 7.49144001]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183580": {
    "geometry": {
      "coordinates": [
        [
          [3.883780192, 7.491438512],
          [3.883813625, 7.491437013],
          [3.883815416, 7.491482233],
          [3.883781981, 7.491483732],
          [3.883780192, 7.491438512]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183624": {
    "geometry": {
      "coordinates": [
        [
          [3.883813625, 7.491437013],
          [3.883847059, 7.491435513],
          [3.883848849, 7.491480733],
          [3.883815416, 7.491482233],
          [3.883813625, 7.491437013]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183535": {
    "geometry": {
      "coordinates": [
        [
          [3.883847059, 7.491435513],
          [3.883880493, 7.491434014],
          [3.883882282, 7.491479234],
          [3.883848849, 7.491480733],
          [3.883847059, 7.491435513]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183629": {
    "geometry": {
      "coordinates": [
        [
          [3.883815769, 7.491491171],
          [3.883849202, 7.491489672],
          [3.883850992, 7.491534892],
          [3.883817558, 7.491536391],
          [3.883815769, 7.491491171]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183498": {
    "geometry": {
      "coordinates": [
        [
          [3.883782336, 7.49149267],
          [3.883815769, 7.491491171],
          [3.883817558, 7.491536391],
          [3.883784125, 7.49153789],
          [3.883782336, 7.49149267]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183637": {
    "geometry": {
      "coordinates": [
        [
          [3.883748902, 7.491494169],
          [3.883782336, 7.49149267],
          [3.883784125, 7.49153789],
          [3.883750692, 7.491539389],
          [3.883748902, 7.491494169]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183447": {
    "geometry": {
      "coordinates": [
        [
          [3.883715469, 7.491495667],
          [3.883748902, 7.491494169],
          [3.883750692, 7.491539389],
          [3.883717258, 7.491540888],
          [3.883715469, 7.491495667]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183584": {
    "geometry": {
      "coordinates": [
        [
          [3.883682035, 7.491497166],
          [3.883715469, 7.491495667],
          [3.883717258, 7.491540888],
          [3.883683824, 7.491542386],
          [3.883682035, 7.491497166]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183612": {
    "geometry": {
      "coordinates": [
        [
          [3.883648602, 7.491498666],
          [3.883682035, 7.491497166],
          [3.883683824, 7.491542386],
          [3.883650391, 7.491543886],
          [3.883648602, 7.491498666]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183515": {
    "geometry": {
      "coordinates": [
        [
          [3.883615168, 7.491500165],
          [3.883648602, 7.491498666],
          [3.883650391, 7.491543886],
          [3.883616958, 7.491545385],
          [3.883615168, 7.491500165]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183512": {
    "geometry": {
      "coordinates": [
        [
          [3.883581735, 7.491501664],
          [3.883615168, 7.491500165],
          [3.883616958, 7.491545385],
          [3.883583524, 7.491546884],
          [3.883581735, 7.491501664]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183570": {
    "geometry": {
      "coordinates": [
        [
          [3.883583878, 7.491555822],
          [3.883617312, 7.491554323],
          [3.883619101, 7.491599543],
          [3.883585668, 7.491601042],
          [3.883583878, 7.491555822]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183471": {
    "geometry": {
      "coordinates": [
        [
          [3.883617312, 7.491554323],
          [3.883650745, 7.491552824],
          [3.883652535, 7.491598044],
          [3.883619101, 7.491599543],
          [3.883617312, 7.491554323]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183546": {
    "geometry": {
      "coordinates": [
        [
          [3.883650745, 7.491552824],
          [3.883684179, 7.491551325],
          [3.883685968, 7.491596546],
          [3.883652535, 7.491598044],
          [3.883650745, 7.491552824]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183496": {
    "geometry": {
      "coordinates": [
        [
          [3.883684179, 7.491551325],
          [3.883717612, 7.491549826],
          [3.883719401, 7.491595046],
          [3.883685968, 7.491596546],
          [3.883684179, 7.491551325]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183595": {
    "geometry": {
      "coordinates": [
        [
          [3.883717612, 7.491549826],
          [3.883751045, 7.491548327],
          [3.883752835, 7.491593547],
          [3.883719401, 7.491595046],
          [3.883717612, 7.491549826]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183559": {
    "geometry": {
      "coordinates": [
        [
          [3.883751045, 7.491548327],
          [3.883784478, 7.491546828],
          [3.883786269, 7.491592048],
          [3.883752835, 7.491593547],
          [3.883751045, 7.491548327]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183449": {
    "geometry": {
      "coordinates": [
        [
          [3.883784478, 7.491546828],
          [3.883817913, 7.491545329],
          [3.883819702, 7.491590549],
          [3.883786269, 7.491592048],
          [3.883784478, 7.491546828]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183565": {
    "geometry": {
      "coordinates": [
        [
          [3.883817913, 7.491545329],
          [3.883851346, 7.49154383],
          [3.883853135, 7.49158905],
          [3.883819702, 7.491590549],
          [3.883817913, 7.491545329]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183441": {
    "geometry": {
      "coordinates": [
        [
          [3.883753189, 7.491602485],
          [3.883786622, 7.491600986],
          [3.883788411, 7.491646206],
          [3.883754978, 7.491647705],
          [3.883753189, 7.491602485]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183520": {
    "geometry": {
      "coordinates": [
        [
          [3.883719755, 7.491603984],
          [3.883753189, 7.491602485],
          [3.883754978, 7.491647705],
          [3.883721545, 7.491649204],
          [3.883719755, 7.491603984]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183640": {
    "geometry": {
      "coordinates": [
        [
          [3.883686322, 7.491605484],
          [3.883719755, 7.491603984],
          [3.883721545, 7.491649204],
          [3.883688112, 7.491650704],
          [3.883686322, 7.491605484]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  },
  "1183497": {
    "geometry": {
      "coordinates": [
        [
          [3.883652888, 7.491606983],
          [3.883686322, 7.491605484],
          [3.883688112, 7.491650704],
          [3.883654678, 7.491652203],
          [3.883652888, 7.491606983]
        ]
      ],
      "type": "Polygon"
    },
    "type": "Feature",
    "properties": {
      "format": "WGS84"
    }
  }
};
