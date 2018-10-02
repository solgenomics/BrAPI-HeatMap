import d3 from "d3";
import turf from "@turf/turf";

export default function(HeatMap){
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
            same_pos[obs.Y+","+obs.X].push(obs.observationUnitDbId)
          }
          else{
            same_pos[obs.Y+","+obs.X] = [obs.observationUnitDbId]
            same_pos[obs.Y+","+obs.X].pos = [obs.Y,obs.X]
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
          })
        })
      }
      else {
        // has GPS position info
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
          same_pos[row+","+col].push(obs.observationUnitDbId)
        }
        else{
          same_pos[row+","+col] = [obs.observationUnitDbId]
          same_pos[row+","+col].pos = [row,col]
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
        })
      })
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
          f.geometry.coordinates=f.geometry.coordinates.map(c=>c+=Math.random()*0.000002-0.000001)
        })
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
        )
        this.polygon_subdivide_memo[memo_id] = voronoi.features.map(vc=>{
          var a = vc;
          var b = polygon;
          var mask = turf.mask(vc,turf.bboxPolygon(polygonbbox));
          var c = turf.difference(polygon,mask);
          return c
        });
      }
      return this.polygon_subdivide_memo[memo_id];
    }
  }
}
