import d3 from "d3";

export default function(HeatMap){
  HeatMap.prototype.trait_set = function(t){
    this.controls._trait = t;
    this.colorscale = d3.scaleSequential(d3.interpolatePlasma);
    let trait_accessor = this.trait_accessor(t);
    this.colorscale.domain(
      d3.extent(
        d3.values(this.layout_data),
        trait_accessor
      )
    );
    this.traitcolor = obs=>{
      let val = trait_accessor(obs);
      if(val==undefined) return "none";
      return this.colorscale(val);
    };
    this._redraw_scale();
    this.redraw();
  }

  HeatMap.prototype.trait_accessor = function(t){
    return obs=>d3.mean(
      obs.observations.filter(ob=>ob.observationVariableDbId==t),
      ob=>ob.value
    );
  }
}
