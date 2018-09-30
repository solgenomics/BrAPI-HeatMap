// rollup.config.js
export default {
  input: 'index',
  output: {
    file: 'dist/BrAPIHeatMap.js',
    format: 'umd',
    name: 'BrAPIHeatMap',
    globals: {
      'd3':'d3',
      '@turf/turf':'turf',
      '@solgenomics/BrAPI-js':'BrAPI',
      'leaflet':'L',
    }
  }
};
