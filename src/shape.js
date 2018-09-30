import d3 from "d3";
import turf from "@turf/turf";

export default function(HeatMap){
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
        })
      }
      else {
        // has GPS position info
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
    this.map.fitBounds([[bb[1],bb[0]],[bb[3],bb[2]]])
  }

  HeatMap.prototype.shape_obsUnit = function(obs){
    return this._obsUnit_shapes[obs.observationUnitDbId];
  }

  HeatMap.prototype.shape_bounds = function(){
    return turf.bbox(
      turf.featureCollection(
        d3.values(this._obsUnit_shapes)
      )
    );
  }

  HeatMap.prototype.shape_hullDist = function(feature_collection){
    var length = feature_collection.features.length;
    return Math.sqrt(turf.area(feature_collection)/length)/1000*1.5;
  }

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
  }

  HeatMap.prototype.shape_block = function(bn){
    return this.shape_concave_hull(
      d3.values(this.layout_data).filter(d=>d.blockNumber==bn)
    );
  }

  HeatMap.prototype.shape_rep = function(rn){
    return this.shape_concave_hull(
      d3.values(this.layout_data).filter(d=>d.replicate==rn)
    );
  }
}
