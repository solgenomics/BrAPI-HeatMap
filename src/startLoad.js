import BrAPI from "@solgenomics/brapijs";

export default function(HeatMap){
  /**
   * Loads Phenotype/ObservationUnit Data via BrAPI
   */
  HeatMap.prototype.startLoad = function(){
    this.fieldLayout.classed("Heatmap_loading",true);
    this.layout_data = {};
    BrAPI("https://cassavabase.org/brapi/v1",null,"1.2")
      .phenotypes_search({
        "studyDbIds":[this.studyDbId],
        "observationLevel":"plot",
        'pageSize':100
      })
      .each(d=>{
        d.X = parseFloat(d.X);
        d.Y = parseFloat(d.Y);
        this.layout_data[d.observationUnitDbId] = d;
        this._layout_size = parseInt(d.__response.metadata.pagination.totalCount);
        this.reshape();
      })
      .all(()=>{
        this.fieldLayout.classed("Heatmap_loading",false);
        this._redraw_controls();
        console.log(this.layout_data)
      });
  }
}
