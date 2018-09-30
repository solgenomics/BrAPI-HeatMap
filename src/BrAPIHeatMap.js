import d3 from "d3";
import L from "leaflet";

const DEFAULT_OPTS = {
  defaultPos: [-39.0863,-12.6773],
  gridSize: 500,
  gridDist: 0.002
}

export default class HeatMap {
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

import _redraw from "./_redraw"; _redraw(HeatMap);
import defaultPlot from "./defaultPlot"; defaultPlot(HeatMap);
import focus from "./focus"; focus(HeatMap);
import shape from "./shape"; shape(HeatMap);
import startLoad from "./startLoad"; startLoad(HeatMap);
import trait from "./trait"; trait(HeatMap);

function debounceThrottle(f){ //triggers f every 200ms while called within 25ms repeatedly
  var db;
  var th;
  return ()=>{
    clearTimeout(db)
    db = setTimeout(() => {
      clearTimeout(th)
      th = false;
      f();
    }, 25);
    if(!th){
      th = setTimeout(() => {
        clearTimeout(db)
        th = false;
        f();
      }, 200)
    }
  }
}
