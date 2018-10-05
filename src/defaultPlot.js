import turf from "@turf/turf";

export default function(HeatMap){  
  HeatMap.prototype.defaultPlot = function(row,col,size){
    size = size || this.opts.defaultPlotWidth;
    if(!this.opts.shape_memo || this.opts.shape_memo.size!=size){
      this.opts.shape_memo = Array(this.opts.gridSize*this.opts.gridSize);
      this.opts.shape_memo.size = size;
    } 
    if(!this.opts.shape_memo[(row*this.opts.gridSize)+col]){
      var o = turf.point(this.opts.defaultPos);
      var tl = turf.destination(
        turf.destination(
          o,
          size*col,
          90,
          {'units':'kilometers'}
        ),
        size*row,
        180,
        {'units':'kilometers'}
      );
      var br = turf.destination(
        turf.destination(
          tl,
          size,
          90,
          {'units':'kilometers'}
        ),
        size,
        180,
        {'units':'kilometers'}
      );
      var tr = turf.point([tl.geometry.coordinates[0],br.geometry.coordinates[1]]);
      var bl = turf.point([br.geometry.coordinates[0],tl.geometry.coordinates[1]]);
      this.opts.shape_memo[(row*this.opts.gridSize)+col] = turf.polygon([
        [tl, tr, br, bl, tl].map(turf.getCoord)
      ], {});
    }
    return this.opts.shape_memo[(row*this.opts.gridSize)+col];
  }
  
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
  }
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
