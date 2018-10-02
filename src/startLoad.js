import BrAPI from "@solgenomics/brapijs";

export default function(HeatMap){
  /**
   * Loads Phenotype/ObservationUnit Data via BrAPI
   */
  HeatMap.prototype.startLoad = function(){
    this.fieldLayout.classed("Heatmap_loading",true);
    this.layout_data = {};
    this.controls.unit_sel.attr("disabled",true);
    BrAPI(this.brapi_endpoint,this.opts.brapi_auth,"1.2")
      .phenotypes_search({
        "studyDbIds":[this.studyDbId],
        "observationLevel":this.opts.observationLevel,
        'pageSize':this.opts.brapi_pageSize
      })
      .each(d=>{
        d.X = parseFloat(d.X);
        d.Y = parseFloat(d.Y);
        this.layout_data[d.observationUnitDbId] = d;
        this.reshape();
      })
      .all(()=>{
        this.fieldLayout.classed("Heatmap_loading",false);
        this._redraw_controls();
        this.controls.unit_sel.attr("disabled",null);
        console.log(this.layout_data)
      });
  }
}
