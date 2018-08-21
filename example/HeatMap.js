(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global.GraphicalFilter = factory());
}(this, (function () { 'use strict';



//<script defer="defer" type="text/javascript" >
//var trial_id = <% $trial_id %>;
var trial_id = 20;
var value = 'plot';
var selected;
var trialStudyDesign;
var phenotypes_id = [];
var ctrlFuncDataset;
jQuery(document).ready( function() {

    function assayed_trait_heatmap_view(selected) {
        var selectedTrait = selected;
        jQuery.ajax( {
            //url: '/ajax/breeders/trial/'+trial_id+'/heatmap?selected='+selected,
            url: '/brapi/v1/phenotypes-search?observationLevel=plot&studyDbId='+trial_id+'&observationVariableDbId='+selectedTrait+'&pageSize=1000&page=0',
            beforeSend: function() {
                jQuery("#working_modal").modal("show");
            },
            success: function(response) {
                var data = response.result.data; 
                var datasort = data.sort(function(obj1, obj2) {
	                  // Ascending: first plotNumber less than the previous
	                return obj1.plotNumber - obj2.plotNumber;
                });
                var newData = datasort;
                var rows = [];
                var cols = [];
                var blocks = [];
                var accession_names = [];
                var accession_ids = [];
                var pheno_ids = [];
                var pheno_values = [];
                var plot_names = [];
                var replicates = [];
                var plot_mums = [];
                var check = [];
                var replicates = [];
                var plot_ids = [];
                var trait_names = [];
                var trait_ids = [];
                var design = trialStudyDesign;
                var plot_mums = [];
                var observ_object = [];

                jQuery.each(newData, function(key_obj, value_obj) {
                    jQuery.each(value_obj, function(key, value) {
                        if (key == 'Y'){
                            rows.push(value);
                        }
                        if (key == 'X'){
                            cols.push(value);
                        }
                        if (key == 'blockNumber'){
                            blocks.push(value);
                        }
                        if (key == 'entryType'){
                            check.push(value);
                        }
                        if (key == 'germplasmDbId'){
                            accession_ids.push(value);
                        }
                        if (key == 'germplasmName'){
                            accession_names.push(value);
                        }
                        if (key == 'plotNumber'){
                            plot_mums.push(value);
                        }
                        if (key == 'observationUnitDbId'){
                            plot_ids.push(value);
                        }
                        if (key == 'observationUnitName'){
                            plot_names.push(value);
                        }
                        if (key == 'replicate'){
                            replicates.push(value);
                        }
                        if (key == 'designType'){
                            design = value;
                        }
                        if (key == 'observations'){
                            var valueObs = value[0];
                           pheno_ids.push(valueObs.observationDbId);
                           trait_ids.push(valueObs.observationVariableDbId);
                           trait_names.push(valueObs.observationVariableName);
                           pheno_values.push(valueObs.value);
                        } 
                    });    
                });

                var psudo_rows = [];
                var map_option = 0;
                for (i=0; i<plot_names.length; i++){ 
                    if (rows[i] != null) {}
                    else if (rows[i] == null) {
                        map_option = 1;
            			if (blocks[i] && design != 'splitplot'){
            				var r = blocks[i];
            				psudo_rows.push(r);
            			}
                        else if (replicates[i] && !blocks[i] && design != 'splitplot'){
            				var s = replicates[i];
            				psudo_rows.push(s);
            			}
                        else if (design == 'splitplot'){
                            var s = replicates[i];
            				psudo_rows.push(s);
                        }
            		}
                }

                var false_coord;
                if (map_option == 1){
                    rows = psudo_rows;
                    false_coord = 'false_coord';
                }
                var unique_rows = [];
                var unique_cols = [];
                var unique = rows.filter(function(itm, i, rows) {
                    if (i == rows.indexOf(itm)){
                        unique_rows.push(itm);
                    }
                });
                
                function makeArray(count, content) {
                   var result = [];
                   var counting = 0;
                   if(typeof(content) == "function") {
                       counting = 1;
                      for(var i=0; i<count; i++) {
                          result.push(counting);
                         counting++;
                      }
                   } else {
                       counting = 1;
                      for(var i=0; i<count; i++) {
                         result.push(counting);
                         counting++;
                      }
                   }
                   return result;
                }

                var psudo_cols = [];
                var psudo_columns = [];
                var counts = {};
                if (map_option == 1){
                    for (var i = 0; i < rows.length; i++) {
                        counts[rows[i]] = 1 + (counts[rows[i]] || 0);
                    }
                    jQuery.each(counts, function(key, value){
                        psudo_cols.push(makeArray(value, key));
                    });
                    var psudo_columns = [].concat.apply([], psudo_cols);
                    cols = psudo_columns;
                }
                var unique = cols.filter(function(itm, i, cols) {
                    if (i == cols.indexOf(itm)){
                        unique_cols.push(itm);
                    }
                });

                var plot_popUp;
                var result = [];
                for (var i=0; i<plot_names.length; i++){ 
        			plot_popUp = plot_names[i]+"\nplot_No: "+plot_mums[i]+"\nblock_No: "+blocks[i]+"\nrep_No:"+replicates[i]+"\nstock:"+accession_names[i]+"\nvalue:"+pheno_values[i];
            		result.push({plotname:plot_names[i], stock:accession_names[i], plotn:plot_mums[i], blkn:blocks[i], rep:replicates[i], row:rows[i], col:cols[i], pheno:pheno_values[i], plot_msg:plot_popUp, pheno_id:pheno_ids[i]}) ;
                }
                
                var col_max = Math.max.apply(Math,unique_cols);
                var row_max = Math.max.apply(Math,unique_rows);
                var rep_max = Math.max.apply(Math,replicates);
                var block_max = Math.max.apply(Math,blocks);
                var col_length = cols[0]; 
                var row_length = rows[0];
                var controls = [];
                var unique_ctrl = [];
                var plots = plot_mums;
                var col_max;

                if (col_length && row_length) {
                    jQuery("#working_modal").modal("hide");
                    jQuery("#chart").css({"display": "inline-block"});
                    jQuery("#container_heatmap").css({"display": "inline-block", "overflow": "auto"});
                    jQuery("#trait_heatmap").css("display", "none");
                    
                    var default_width = 50 * col_max;
                    var default_Width_used;
                    if (default_width < 684){
                        default_Width_used = 684;
                    }else { default_Width_used = 50 * col_max; }
                    
                  var margin = { top: 50, right: 0, bottom: 100, left: 30 },
                      width = default_Width_used + 30 - margin.left - margin.right,
                      height = 50 * row_max + 150 - margin.top - margin.bottom,
                     // gridSize = Math.floor(width / 24),
                      gridSize = 50,
                      gridSize2 = 38,
                      legendElementWidth = gridSize2*2,
                      buckets = 9,
                      colors = ["#ffffd9","#edf8b1","#c7e9b4","#7fcdbb","#41b6c4","#1d91c0","#225ea8","#253494","#081d58"], // alternatively colorbrewer.YlGnBu[9]
                      rows = unique_rows,
                      columns = unique_cols;
                      datasets = result;
                      ctrlFuncDataset = datasets;
                
                  var svg = d3.select("#container_heatmap").append("svg")
                      .attr("width", width + margin.left + margin.right)
                      .attr("height", height + margin.top + margin.bottom)
                      .append("g")
                      .attr("transform", "translate(" + margin.left + "," + 100 + ")");

                  var rowLabels = svg.selectAll(".rowLabel")
                      .data(rows)
                      .enter().append("text")
                        .text(function (d) { return d; })
                        .attr("x", 0 )
                        .attr("y", function (d, i) { return i * gridSize; })
                        .style("text-anchor", "end")
                        .attr("transform", "translate(-6," + gridSize / 1.5 + ")")
                        .attr("class", function (d, i) { return ((i >= 0 && i <= 4) ? "rowLabel mono axis axis-workweek" : "rowLabel mono axis"); });

                  var columnLabels = svg.selectAll(".columnLabel")
                      .data(columns)
                      .enter().append("text")
                      .text(function(d) { return d; })
                      .attr("x", function(d, i) { return i * gridSize; })
                      .attr("y", 0 )
                      .style("text-anchor", "middle")
                      .attr("transform", "translate(" + gridSize / 2 + ", -6)")
                      .attr("class", function(d, i) { return ((i >= 7 && i <= 16) ? "columnLabel mono axis axis-worktime" : "columnLabel mono axis"); });                
                  
                  var heatmapChart = function(datasets) {
                    
                    datasets.forEach(function(d) { 

                        d.row = +d.row;
                        d.col = +d.col;
                        d.pheno = +d.pheno;  
                    });      

                      var colorScale = d3.scale.quantile()
                          .domain([0, buckets - 1, d3.max(datasets, function (d) { return d.pheno; })])
                          .range(colors);
                                                
                      var cards = svg.selectAll(".col")
                          .data(datasets, function(d) {return d.row+':'+d.col;});

                      cards.append("title");                  

                      cards.enter().append("rect")
                          .attr("x", function(d) { return (d.col - 1) * gridSize; })
                          .attr("y", function(d) { return (d.row - 1) * gridSize; })
                          .attr("rx", 4)
                          .attr("ry", 4)
                          .attr("class", "col bordered")
                          .attr("width", gridSize)
                          .attr("height", gridSize)
                          .style("fill", colors[0])
                          .on("click", function(d) { 
                                                     var phenoValue = d.pheno ;
                                                     var plotName = d.plotname ; 
                                                     var phenoID = d.pheno_id;
                                                     jQuery("#suppress_plot_pheno_dialog").modal("show"); 
                                                     jQuery("#myplot_name").html(plotName);
                                                     jQuery("#pheno_value").html(phenoValue);
                                                     jQuery("#mytrait_id").html(selected);
                                                     jQuery("#mypheno_id").html(phenoID);
                                                     
                                                        })
                          .on("mouseover", function(d) { d3.select(this).style('fill', 'green'); 
                                                                            //console.log('over');
                                                        })
                          .on("mouseout", function(d) { 
                                                          var colorScale = d3.scale.quantile()
                                                              .domain([0, buckets - 1, d3.max(datasets, function (d) { return d.pheno; })])
                                                              .range(colors);
                          
                                                          var cards = svg.selectAll(".col")
                                                              .data(datasets, function(d) {return d.row+':'+d.col;});

                                                          cards.append("title");
                                                          
                                                          cards.enter().append("rect")
                                                            .attr("x", function(d) { return (d.col - 1) * gridSize; })
                                                            .attr("y", function(d) { return (d.row - 1) * gridSize; })
                                                            .attr("rx", 4)
                                                            .attr("ry", 4)
                                                            .attr("class", "col bordered")
                                                            .attr("width", gridSize)
                                                            .attr("height", gridSize)
                                                            .style("fill", colors[0]); 
                                                            
                                                            cards.style("fill", function(d) { return colorScale(d.pheno); }) ;                          

                                                            cards.select("title").text(function(d) { return d.plot_msg; }) ;
                                                            
                                                            cards.exit().remove();
                                                            //console.log('out');
                                                            });

                      //cards.transition().duration(1000)
                      cards.style("fill", function(d) { return colorScale(d.pheno); }) ;                          

                      cards.select("title").text(function(d) { return d.plot_msg; }) ;
                      
                      cards.exit().remove();
             
                      var legend = svg.selectAll(".legend")
                          .data([0].concat(colorScale.quantiles()), function(d) { return d; });
                     
                      legend.enter().append("g")
                          .attr("class", "legend");

                      legend.append("rect")
                        .attr("x", function(d, i) { return legendElementWidth * i; })
                        .attr("y", 0 - 90)
                        .attr("width", legendElementWidth)
                        .attr("height", gridSize2 / 2)
                        .style("fill", function(d, i) { return colors[i]; });

                      legend.append("text")
                        .attr("class", "mono")
                        .text(function(d) { return ">= " + Math.round(d); })
                        .attr("x", function(d, i) { return legendElementWidth * i; })
                        .attr("y", 0 - 90 + gridSize2);

                      legend.exit().remove();
                     
                    } ; 
                  
                  heatmapChart(datasets);
                  if (false_coord){
                      alert("Pseudo row and column numbers have been used in displaying the heat map. Plot's row and column numbers were generated from block_number and displayed in zigzag format. You can upload row and column numbers for this trial to reflect the true field layout.");
                  }
    
                }
                else  {
                    jQuery("#working_modal").modal("hide");
                    jQuery("#container_heatmap").css("display", "none");
                    jQuery("#trait_heatmap").css("display", "none");
                    jQuery("#trial_no_rowColMSG").css("display", "none");
                }
            },
             error: function(reponse) {
                alert('Error displaying traits assayed heatmap');   
            }
        });
    }
    var image = [];
    var image_ids = [];
    function btnClick(n){
      if (n.length == 0){
         jQuery("#hm_view_plot_image_submit").addClass("disabled");
      } else {
        jQuery("#hm_view_plot_image_submit").removeClass("disabled");
      }
      return true; 
    }
    var list_of_checks;
    var checks = {};
    function field_map_view() {
        checks = {};
        jQuery("#ctrldiv").css("display", "none");
        jQuery.ajax( {
             //url: '/ajax/breeders/trial/'+trial_id+'/coords', 
             url: '/brapi/v1/studies/'+trial_id+'/layout?pageSize=1000&page=0',
             beforeSend: function() {
               jQuery("#working_modal").modal("show");
             },
             success: function(response) {
                var data = response.result.data;
                var rows = [];
                var cols = [];
                var blocks = [];
                var check = [];
                var accession_ids = [];
                var accession_names = [];
                var plot_ids = [];
                var plot_names = [];
                var replicates = [];
                var plot_mums = [];
                var design;
                var plotImageDbIds = [];
                var plant_names = [];
                jQuery.each(data, function(key_obj, value_obj) {
                    jQuery.each(value_obj, function(key, value) {
                        if (key == 'Y'){
                            rows.push(value);
                        }
                        if (key == 'X'){
                            cols.push(value);
                        }
                        if (key == 'blockNumber'){
                            blocks.push(value);
                        }
                        if (key == 'entryType'){
                            check.push(value);
                        }
                        if (key == 'germplasmDbId'){
                            accession_ids.push(value);
                        }
                        if (key == 'germplasmName'){
                            accession_names.push(value);
                        }
                        if (key == 'observationUnitDbId'){
                            plot_ids.push(value);
                        }
                        if (key == 'observationUnitName'){
                            plot_names.push(value);
                        }
                        if (key == 'replicate'){
                            replicates.push(value);
                        }
                        if (key == 'additionalInfo'){
                            jQuery.each(value, function(key_add, value_add){
                                if (key_add == 'plotNumber'){
                                    plot_mums.push(value_add);
                                }
                                if (key_add == 'designType'){
                                    design = value_add;
                                    trialStudyDesign = value_add;
                                }
                                if (key_add == 'plotImageDbIds'){
                                    plotImageDbIds.push(value_add);
                                }
                                if (key_add == 'plantNames'){
                                    var s = value_add.length;
                                    plant_names.push(s); 
                                }
                            });
                        }
                    });
                });

                var psudo_rows = [];
                var map_option = 0;
                for (i=0; i<plot_names.length; i++){ 
                    if (rows[i] != '') {}
                    else if (rows[i] == '') {
                        map_option = 1;
            			if (blocks[i] && design != 'splitplot'){
            				var r = blocks[i];
            				psudo_rows.push(r);
            			}
                        else if (replicates[i] && !blocks[i] && design != 'splitplot'){
            				var s = replicates[i];
            				psudo_rows.push(s);
            			}
                        else if (design == 'splitplot'){
                            var s = replicates[i];
            				psudo_rows.push(s);
                        }
            		}
                }

                var false_coord;
                if (map_option == 1){
                    rows = psudo_rows;
                    false_coord = 'false_coord';
                }
                var unique_rows = [];
                var unique_cols = [];
                var unique = rows.filter(function(itm, i, rows) {
                    if (i == rows.indexOf(itm)){
                        unique_rows.push(itm);
                    }
                });
                
                function makeArray(count, content) {
                   var result = [];
                   var counting = 0;
                   if(typeof(content) == "function") {
                       counting = 1;
                      for(var i=0; i<count; i++) {
                          result.push(counting);
                         counting++;
                      }
                   } else {
                       counting = 1;
                      for(var i=0; i<count; i++) {
                         result.push(counting);
                         counting++;
                      }
                   }
                   return result;
                }

                var psudo_cols = [];
                var psudo_columns = [];
                var counts = {};
                if (map_option == 1){
                    for (var i = 0; i < rows.length; i++) {
                        counts[rows[i]] = 1 + (counts[rows[i]] || 0);
                    }
                    jQuery.each(counts, function(key, value){
                        psudo_cols.push(makeArray(value, key));
                    });
                    var psudo_columns = [].concat.apply([], psudo_cols);
                    cols = psudo_columns;
                }
                var unique = cols.filter(function(itm, i, cols) {
                    if (i == cols.indexOf(itm)){
                        unique_cols.push(itm);
                    }
                });
                
                var plot_popUp;
                var result = [];
                for (var i=0; i<plot_names.length; i++){
                    if (plant_names[i] < 1) { 
            			plot_popUp = plot_names[i]+"\nplot_No: "+plot_mums[i]+"\nblock_No: "+blocks[i]+"\nrep_No:"+replicates[i]+"\nstock:"+accession_names[i];
            		}
            		else{
            			plot_popUp = plot_names[i]+"\nplot_No: "+plot_mums[i]+"\nblock_No: "+blocks[i]+"\nrep_No:"+replicates[i]+"\nstock:"+accession_names[i]+"\nnumber_of_plants:"+plant_names[i];
                    }
            		result.push({plotname:plot_names[i], plot_id:plot_ids[i], stock:accession_names[i], plotn:plot_mums[i], blkn:blocks[i], rep:replicates[i], row:rows[i], plot_image_ids:plotImageDbIds[i], col:cols[i], plot_msg:plot_popUp}) ;
                }
                                
                var col_max = Math.max.apply(Math,unique_cols);
                var row_max = Math.max.apply(Math,unique_rows);
                var rep_max = Math.max.apply(Math,replicates);
                var block_max = Math.max.apply(Math,blocks);                
                var col_length = cols[0]; 
                var row_length = rows[0];
                var controls = [];
                var unique_ctrl = [];
                var plots = plot_mums;
                var col_max;
                var stocks = accession_names;
                for (var i = 0; i < check.length; i++) {
                    if ( check[i] == "Check") {
                        var s = stocks[i];
                        controls.push(s);
                    }
                }
                
                if (controls){
                    var unique = controls.filter(function(itm, i, controls) {
                        if (i == controls.indexOf(itm)){
                            unique_ctrl.push(itm);
                        }
                    });
                    
                    list_of_checks = unique_ctrl;
                    for (var i = 0; i < stocks.length; i++) {
                        for (var n = 0; n < unique_ctrl.length; n++){
                            if ( unique_ctrl[n] == stocks[i]) {
                                var p = plots[i];
                                var s = stocks[i];
                                checks[p] = s;
                            }
                        }
                    }
                }
                
                design_type = design;
                if (col_length && row_length) {
                    jQuery("#working_modal").modal("hide");
                    jQuery("#chart_fm").css({"display": "inline-block"});
                    jQuery("#container_fm").css({"display": "inline-block", "overflow": "auto"});
                    jQuery("#trait_heatmap").css("display", "none");
                    jQuery("#d3legend").css("display", "inline-block");
                    jQuery("#container_heatmap").css("display", "none");
                    jQuery("#trait_heatmap").css("display", "none");

                  var margin = { top: 50, right: 0, bottom: 100, left: 30 },
                      width = 50 * col_max + 30 - margin.left - margin.right,
                      height = 50 * row_max + 100 - margin.top - margin.bottom,
                      gridSize = 50,
                      legendElementWidth = gridSize*2,
                      buckets = 9,
                      colors = ["#ffffd9","#edf8b1","#c7e9b4","#7fcdbb","#41b6c4","#1d91c0","#225ea8","#253494","#081d58"], // alternatively colorbrewer.YlGnBu[9]
                      rows = unique_rows,
                      columns = unique_cols;
                      datasets = result;
                     
                  var svg = d3.select("#container_fm").append("svg")
                      .attr("width", width + margin.left + margin.right)
                      .attr("height", height + margin.top + margin.bottom)
                      .append("g")
                      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
                                        
                  var rowLabels = svg.selectAll(".rowLabel")
                      .data(rows)
                      .enter().append("text")
                        .text(function (d) { return d; })
                        .attr("x", 0 )
                        .attr("y", function (d, i) { return i * gridSize; })
                        .style("text-anchor", "end")
                        .attr("transform", "translate(-6," + gridSize / 1.5 + ")")
                        .attr("class", function (d, i) { return ((i >= 0 && i <= 4) ? "rowLabel mono axis axis-workweek" : "rowLabel mono axis"); });

                  var columnLabels = svg.selectAll(".columnLabel")
                      .data(columns)
                      .enter().append("text")
                        .text(function(d) { return d; })
                        .attr("x", function(d, i) { return i * gridSize; })
                        .attr("y", 0 )
                        .style("text-anchor", "middle")
                        .attr("transform", "translate(" + gridSize / 2 + ", -6)")
                        .attr("class", function(d, i) { return ((i >= 7 && i <= 16) ? "columnLabel mono axis axis-worktime" : "columnLabel mono axis"); });                
                  
                    var heatmapChart = function(datasets) {
                        datasets.forEach(function(d) { 
                            d.row = +d.row;
                            d.col = +d.col;
                            d.blkn = +d.blkn;   
                        });
                    
                        var cards = svg.selectAll(".col")
                        .data(datasets, function(d) {return d.row+':'+d.col;});

                        cards.append("title");
                        var image_icon = function (d, i){
                            image = d.plot_image_ids; 
                            var plot_image;
                            if (image.length > 0){
                                plot_image = "/static/css/images/plot_images.png"; 
                            }else{
                                plot_image = "";
                            }
                            return plot_image;
                        }
                      
                        var colors = function (d, i){
                            if (block_max == 1){
                                color = '#41b6c4';
                            }
                            else if (block_max > 1){
                                if (d.blkn % 2 == 0){
                                    color = '#c7e9b4';
                                }
                                else{
                                    color = '#41b6c4'
                                }
                            }
                            else{
                                color = '#c7e9b4';
                            }
                            if (unique_ctrl) {
                                for (var i = 0; i < unique_ctrl.length; i++) {
                                    if ( unique_ctrl[i] == d.stock) {
                                        color = '#081d58';
                                    }
                                }
                            }
                            return color;
                        }
                        
                        var strokes = function (d, i){
                            var stroke;
                            if (rep_max == 1){
                              stroke = 'green';
                            }
                            else if (rep_max > 1){
                                if (d.rep % 2 == 0){
                                    stroke = 'red';
                                }
                                else{
                                    stroke = 'green'
                                }
                            }
                            else{
                                stroke = 'red';
                            }
                            return stroke;
                          }
                          
                          function clickcancel() {
                            var event = d3.dispatch('click', 'dblclick');
                            function cc(selection) {
                                var down,
                                    tolerance = 5,
                                    last,
                                    wait = null;
                                function dist(a, b) {
                                    return Math.sqrt(Math.pow(a[0] - b[0], 2), Math.pow(a[1] - b[1], 2));
                                }
                                selection.on('mousedown', function() {
                                    down = d3.mouse(document.body);
                                    last = +new Date();
                                });
                                selection.on('mouseup', function() {
                                    if (dist(down, d3.mouse(document.body)) > tolerance) {
                                        return;
                                    } else {
                                        if (wait) {
                                            window.clearTimeout(wait);
                                            wait = null;
                                            event.dblclick(d3.event);
                                        } else {
                                            wait = window.setTimeout((function(e) {
                                                return function() {
                                                    event.click(e);
                                                    wait = null;
                                                };
                                            })(d3.event), 300);
                                        }
                                    }
                                });
                            };
                            return d3.rebind(cc, event, 'on');
                          }
                        var cc = clickcancel();
                      
                      cards.enter().append("rect")
                          .attr("x", function(d) { return (d.col - 1) * gridSize; })
                          .attr("y", function(d) { return (d.row - 1) * gridSize; })
                          .attr("rx", 4)
                          .attr("ry", 4)
                          .attr("class", "col bordered")
                          .attr("width", gridSize)
                          .attr("height", gridSize)
                          .style("stroke-width", 2)
                          .style("stroke", strokes)
                          .style("fill", colors)
                          
                          .on("mouseover", function(d) { d3.select(this).style('fill', 'green'); })
                          .on("mouseout", function(d) { 
                                                          var cards = svg.selectAll(".col")
                                                              .data(datasets, function(d) {return d.row+':'+d.col;});

                                                          cards.append("title");
                                                          
                                                          cards.enter().append("rect")
                                                            .attr("x", function(d) { return (d.col - 1) * gridSize; })
                                                            .attr("y", function(d) { return (d.row - 1) * gridSize; })
                                                            .attr("rx", 4)
                                                            .attr("ry", 4)
                                                            .attr("class", "col bordered")
                                                            .attr("width", gridSize)
                                                            .attr("height", gridSize)
                                                            .style("stroke-width", 2)
                                                            .style("stroke", strokes)
                                                            .style("fill", colors); 
                                                            
                                                            cards.style("fill", colors) ;                          

                                                            cards.select("title").text(function(d) { return d.plot_msg; }) ;
                                                            
                                                            cards.exit().remove();
                                                            //console.log('out');
                                                            })                                
                            .call(cc);                                
                                                       
                            cc.on("dblclick", function(el) { var me = d3.select(el.srcElement);
                                                             var d = me.data()[0];
                                                              window.location.href = '/stock/'+d.plot_id+'/view';
                                                            });
                            cc.on("click", function(el) {  
                                                           var me = d3.select(el.srcElement);
                                                           var d = me.data()[0];
                                                           image_ids = d.plot_image_ids;
                                                           var replace_accession = d.stock;
                                                           var replace_plot_id = d.plot_id;
                                                           var replace_plot_name = d.plotname;
                                                           var replace_plot_number = d.plotn;
                                                           
                                                           jQuery('#plot_image_ids').html(image_ids);
                                                           jQuery('#hm_replace_accessions_link').find('button').trigger('click');
                                                           jQuery("#hm_replace_accessions_link").on("click", function(){ btnClick(image_ids); });
                                                           jQuery('#hm_edit_plot_information').html('<b>Selected Plot Information: </b>');
                                                           jQuery('#hm_edit_plot_name').html(replace_plot_name);
                                                           jQuery('#hm_edit_plot_number').html(replace_plot_number);
                                                           old_plot_id = jQuery('#hm_edit_plot_id').html(replace_plot_id);
                                                           old_plot_accession = jQuery('#hm_edit_plot_accession').html(replace_accession);
                                                           jQuery('#hm_replace_plot_accessions_dialog').modal('show');
                                                           
                                                           new jQuery.ajax({
                                                             type: 'POST',
                                                             url: '/ajax/breeders/trial/'+trial_id+'/retrieve_plot_images',
                                                             dataType: "json",
                                                             data: {
                                                                     'image_ids': JSON.stringify(image_ids),
                                                                     'plot_name': replace_plot_name,
                                                                     'plot_id': replace_plot_id,
                                                             },
                                                             success: function (response) {
                                                               jQuery('#working_modal').modal("hide");
                                                               var images = response.image_html;
                                                               if (response.error) {
                                                                 alert("Error Retrieving Plot Images: "+response.error);
                                                               }
                                                               else {
                                                                 jQuery("#show_plot_image_ids").html(images);
                                                                
                                                                // jQuery('#view_plot_image_dialog').modal("show"); 
                                                               }
                                                             },
                                                             error: function () {
                                                               jQuery('#working_modal').modal("hide");
                                                               alert('An error occurred retrieving plot images');
                                                             }
                                                           });
                                                       
                                                          });
                                                          
                      //cards.transition().duration(1000)
                      cards.style("fill", colors) ;  

                      cards.select("title").text(function(d) { return d.plot_msg; }) ;
                      
                      cards.append("text");
                      cards.enter().append("text")
                        .attr("x", function(d) { return (d.col - 1) * gridSize + 10; })
                        .attr("y", function(d) { return (d.row - 1) * gridSize + 20 ; })
                        .text(function(d) { return d.plotn; });
                      
                      cards.select("text").text(function(d) { return d.plotn; }) ;
                         
                      cards.append("image");
                      cards.enter().append("image")
                        .attr("xlink:href", image_icon)
                        .attr("x", function(d) { return (d.col - 1) * gridSize + 2; })
                        .attr("y", function(d) { return (d.row - 1) * gridSize + 3 ; })
                        .attr('width', 10)
                        .attr('height', 10)
                                                  
                      cards.exit().remove();
                    
                    } ; 
                  
                    heatmapChart(datasets);
                    if (false_coord){
                        alert("Psudo row and column numbers have been used in displaying the heat map. Plots row and column numbers were generated from block_number and displayed in zigzag format. You can upload row and column numbers for this trial to reflect the field layout.");
                    }
                }
                else  {
                    jQuery("#working_modal").modal("hide");
                    jQuery("#container_heatmap").css("display", "none");
                    jQuery("#trait_heatmap").css("display", "none");
                    jQuery("#trial_no_rowColMSG").css("display", "inline-block");
                }
             },
             error: function(reponse) {
                alert('Error displaying traits assayed heatmap');   
             }
        });    
    }
    
    jQuery("#hm_view_plot_image_submit").click( function() {
        jQuery("#view_plot_image_dialog").modal("show");
    });
    
    //jQuery("#hm_accession").autocomplete({
    //    appendTo: "#hm_replace_plot_accessions_dialog",
        //source: '/ajax/stock/accession_autocomplete',
    //}); 
    
    jQuery('#hm_replace_plot_accession_submit').click( function() {
      hm_replace_plotAccession_fieldMap();
    });

    function hm_replace_plotAccession_fieldMap() {
      jQuery('#hm_replace_plot_accessions_dialog').modal("hide");
      jQuery('#working_modal').modal("show");

      var new_accession = jQuery('#hm_accession').val();
      var old_accession = jQuery('#hm_edit_plot_accession').html();
      var old_plot_id = jQuery('#hm_edit_plot_id').html();

      new jQuery.ajax({
        type: 'POST',
        url: '/ajax/breeders/trial/'+trial_id+'/replace_plot_accessions',
        dataType: "json",
        data: {
                'new_accession': new_accession,
                'old_accession': old_accession,
                'old_plot_id': old_plot_id,
        },

        success: function (response) {
          jQuery('#working_modal').modal("hide");

          if (response.error) {
            alert("Error Replacing Plot Accession: "+response.error);
          }
          else {
            jQuery('#hm_replace_accessions_dialog_message').modal("show");
          }
        },
        error: function () {
          jQuery('#working_modal').modal("hide");
          alert('An error occurred replacing plot accession');
        }
      });
    }
    
    jQuery('#pheno_heatmap_onswitch').click( function() {
        jQuery("#trait_heatmap").css("display", "none");
        field_map_view();
        jQuery.ajax ( {
            url: '/brapi/v1/studies/'+trial_id+'/observationvariables',
            //url : '/ajax/breeders/trial/'+ <% $trial_id %> + '/traits_assayed?stock_type='+value,
            beforeSend: function() {
              jQuery("#working_modal").modal("show");
            },
            success: function(response){
                var data = response.result.data;
                var varName = [];
                var varID = [];
                jQuery.each(data, function(key_obj, value_obj) {
                    jQuery.each(value_obj, function(key, value) {
                        if (key == 'name'){
                            varName.push(value);
                        }
                        if (key == 'observationVariableDbId'){
                            varID.push(value);
                        }
                    });
                });

                if (varName != '' && varID != '' ) {
                    var traits_assayed_html = "<select class='form-control' id='trait_list_dropdown'>";
                    traits_assayed_html = traits_assayed_html + "<optgroup label='Field Map'>";
                    traits_assayed_html = traits_assayed_html + "<option value='fieldmap'>view field layout</option></optgroup>";
                    traits_assayed_html = traits_assayed_html + "<optgroup label='Assayed Traits'>";
                    for (i=0; i<varID.length; i++) {
                        traits_assayed_html = traits_assayed_html + "<option value="+ varID[i] + " >" + varName[i] + "</option>";
                    }
                    traits_assayed_html = traits_assayed_html +"</optgroup>";
                    traits_assayed_html = traits_assayed_html +"</select>";
                    jQuery("#trait_heatmap").css("display", "none");                   
                    jQuery("#heatmap_traits_assayed_dropdown").html(traits_assayed_html);
                    jQuery("#traitdiv").css("display", "inline-block");
                } 
                else {
                    var traits_assayed_html = "<select class='form-control' id='trait_list_dropdown'>";
                    traits_assayed_html = traits_assayed_html + "<optgroup label='Field Map'>";
                    traits_assayed_html = traits_assayed_html + "<option value='fieldmap'>view field layout</option></optgroup>";
                    traits_assayed_html = traits_assayed_html + "<optgroup label='Assayed Traits'>";
                    traits_assayed_html = traits_assayed_html +"</optgroup>";
                    traits_assayed_html = traits_assayed_html +"</select>";
                    jQuery("#trait_heatmap").css("display", "none");                   
                    jQuery("#heatmap_traits_assayed_dropdown").html(traits_assayed_html);
                    jQuery("#traitdiv").css("display", "inline-block");               
                }
            },
            error: function(response){
                alert('Error retrieving traits assayed in this trial');
            }
        });           
    });
    
    jQuery('#pheno_heatmap_offswitch').click( function() {
        d3.select("svg").remove();
        jQuery("#trait_heatmap").css("display", "none");
        jQuery("#trial_heatmap_div").css("display", "none");
        jQuery("#traitdiv").css("display", "none");
        jQuery("#container_heatmap").css("display", "none");
        jQuery("#chart_fm").css("display", "none");
        jQuery("#container_fm").css("display", "none");
        jQuery("#trial_no_phenoMSG").css("display", "none");
        jQuery("#d3legend").css("display", "none");
    });

  jQuery(document).on('change', '#trait_list_dropdown', function () {
    selected = jQuery("#trait_list_dropdown").val();
    if (selected == ''){ }
    if (jQuery.isNumeric(selected)){
        d3.select("svg").remove();
        jQuery("#d3legend").css("display", "none");
        jQuery("#container_fm").css("display", "none");
        jQuery("#delete_button_fm").css("display", "none");
        jQuery("#ctrldiv").css("display", "none");
        jQuery("#view_ctrl_button").css("display", "inline-block");
        assayed_trait_heatmap_view(selected); 

    }
    if (selected == 'fieldmap'){ 
        d3.select("svg").remove();
        jQuery("#view_ctrl_button").css("display", "none");
        jQuery("#ctrldiv").css("display", "none");
        field_map_view();
    }
    
  });

  jQuery("#suppress_plot_pheno_dialog_submit").click(function() {
    suppress_plot_phenotype();
  });
  
  function suppress_plot_phenotype() {
    jQuery("#suppress_plot_pheno_dialog").modal("hide");
    var sup_plotName = jQuery('#myplot_name').html();
    var sup_traitValue = jQuery('#pheno_value').html();
    var sup_traitID = jQuery('#mytrait_id').html();
    var sup_phenoID = jQuery('#mypheno_id').html();
    
    new jQuery.ajax({
        type: 'POST',
        url: '/ajax/breeders/trial/'+trial_id+'/suppress_phenotype',
        dataType: "json",
        data: {
                'plot_name': sup_plotName,
                'phenotype_value': sup_traitValue,
                'trait_id': sup_traitID,
                'phenotype_id': sup_phenoID,
        },
        beforeSend: function() {
            jQuery('#working_modal').modal("show");
        },
        success: function(response){
            jQuery('#working_modal').modal("hide");
            if (response.error) {
              alert("Error Suppressing Phenotype: "+response.error);
            }else {
                jQuery('#suppress_phenotype_dialog_success_message').modal("show");
            }
          },
          error: function() {
            jQuery('#working_modal').modal("hide");
            alert('An error occurred suppressing phenotype');
          }
    });
  }
  
  jQuery("#delete_trait").click(function() {
    jQuery("#delete_trait_dialog_confirm_message").modal("show");
  });
  jQuery("#delete_selected_trait_dialog_submit").click(function() {
    delete_selected_assayed_trait();
  }); 
  
  function delete_selected_assayed_trait() {
    var pheno_id = phenotypes_id;
    new jQuery.ajax({
        type: 'POST',
        traditional: true,
        url: '/ajax/breeders/trial/'+trial_id+'/delete_single_trait',
        dataType: "json",
        data: {
            'pheno_id': JSON.stringify(pheno_id),
        },
        beforeSend: function(){
            jQuery("#working_modal").modal("show");
        },
        success: function(response){
            jQuery("#working_modal").modal("hide");
            if (response.error){
                alert("Error deleting trait:" +response.error);
            }else{
                jQuery("#delete_trait_dialog_success_message").modal("show");
            }
        },
        error: function(){
            jQuery('#working_modal').modal("hide");
            alert('An error occurred deleting trait');
        }
    });
  
  }
  
  function heatmap_check_change(value) {
      var val = jQuery("#check_list_dropdown").val(value);
      var ret = value.split(",");
      var valStock = ret[0];
      var valPlot = ret[1];
      jQuery('#check_plot_link').html(valPlot + " came from Plot:"+ valStock);
  }
  
   jQuery("#view_ctrl_id_button").click(function(){
       jQuery("#view_ctrl_button").css("display", "none");
       jQuery("#ctrldiv").css("display", "inline-block");
       
       var list_of_checks = checks;  
       var trial_checks_html = "<select class='form-control' id='check_list_dropdown'>";
       trial_checks_html = trial_checks_html + "<option value=''>checks and plot numbers</option>";
       jQuery.each(list_of_checks, function( key, value) {
           trial_checks_html = trial_checks_html + "<option value="+ key + "," + value + " >" + "Plot:"+ key + "  [" + value +"]"+ "</option>";
       });
       trial_checks_html = trial_checks_html +"</select>";
       jQuery("#heatmap_trial_checks_dropdown").html(trial_checks_html);
       jQuery("#heatmap_trial_checks_dropdown>select").change(function(){
           heatmap_check_change(this.value);
       });
   });
      
});

//#new
})));
