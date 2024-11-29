module.exports = {
  // ... other config options
  module: {
    rules: [
      {
        test: /\.worklet\.js$/,
        use: [
          {
            loader: 'worklet-loader',
            options: {
              inline: true
            }
          }
        ]
      }
    ]
  }
}; 