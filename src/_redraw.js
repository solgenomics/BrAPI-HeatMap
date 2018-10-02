import d3 from "d3";
import turf from "@turf/turf";
import L from "leaflet";

export default function(HeatMap){
  
  HeatMap.prototype._redraw = function(){    
    var layout_data = d3.values(this.layout_data);
    this._redraw_obsUnits(layout_data);
    this._redraw_reps(layout_data);
    this._redraw_blocks(layout_data);
    this.resize();
  }
  
  HeatMap.prototype.resize = function(){
    // reposition SVG inside leaflet layer
    let padding = 1000;
    var bbox = this.zoomer.node().getBBox();
    this.svg.attr("width", bbox.width + 2*padding)
      .attr("height", bbox.height + 2*padding)
      .style("left", bbox.x-padding + "px")
      .style("top", bbox.y-padding + "px");
    this.zoomer.attr("transform", `translate(${-bbox.x+padding},${-bbox.y+padding})`);
  }
  
  HeatMap.prototype._redraw_controls = function(){
    if(!this.opts.draw_controls) return
    if(this.opts.draw_control_trait){
      this.controls.traits.style("display",null);
      var trait_observations = d3.values(this.layout_data).reduce((traits,obs)=>{
        obs.observations.forEach(ob=>{
          let t = ob.observationVariableDbId;
          if(!traits[t]) traits[t] = {name:ob.observationVariableName,count:0};
          traits[t].count+=1;
        })
        return traits;
      },{});
      var opts = this.controls.traits.selectAll("option").data(
        d3.entries(trait_observations)
      );
      opts.exit().remove()
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

  }
  
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
      .style("pointer-events","visible")

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
  }

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
  }

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
  }
}
