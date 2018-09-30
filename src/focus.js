export default function(HeatMap){
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
  }
}
