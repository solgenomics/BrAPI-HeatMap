import turf from "@turf/turf";

export default function(HeatMap){
  HeatMap.prototype.defaultPlot_init = function(){
    this.opts.gridHeight = turf.distance(this.opts.defaultPos,turf.along(turf.lineString([this.opts.defaultPos,[this.opts.defaultPos[0],this.opts.defaultPos[1]-1]]),this.opts.gridDist*this.opts.gridSize),{'units':"degrees"})/this.opts.gridSize;
    this.opts.gridWidth = turf.distance(this.opts.defaultPos,turf.along(turf.lineString([this.opts.defaultPos,[this.opts.defaultPos[0]+1,this.opts.defaultPos[1]]]),this.opts.gridDist*this.opts.gridSize),{'units':"degrees"})/this.opts.gridSize;
    this.opts.plot_memo = Array(this.opts.gridSize*this.opts.gridSize);
  }
  
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
    return 1;
  }
}
