# arcgis-dijit-layer-swipe-js

## Features
A swipe widget to partially show a layer by dragging it left or right.

![App](https://raw.github.com/driskull/arcgis-dijit-layer-swipe-js/master/images/demo.png)

[View Demo](http://driskull.github.com/arcgis-dijit-layer-swipe-js/)

## Instructions

Basic use

    var swipeWidget = new LayerSwipe({
        map: map,
        layer: layer
    }, "LayerSwipe");
    swipeWidget.startup();
    
All options
    
     var swipeWidget = new LayerSwipe({
        theme: "LayerSwipe", // applies css class to the widget container
        map: myMap, // map to use for the widget
        layer: myLayer, // layer to use for the swipe widget or string id of the layer eg: "layerId".
        offset: 20 // start the swipe tool 20 pixels from the left on load. (defaults to 1/4 of map width)
    }, "LayerSwipe"); // div to use the widget
    swipeWidget.startup();
    
Hiding the widget

    // option 1
    swipeWidget.set("visible", false); // setting the visible value to false
    
    // option 2
    swipeWidget.hide(); // calling the hide method
    
    // option 3
    myLayer.hide(); // hiding the layer assigned to the widget


 [New to Github? Get started here.](https://github.com/)

## Requirements

* Notepad or HTML editor
* A little background with Javascript
* Experience with the [ArcGIS Javascript API](http://www.esri.com/) would help.

## Resources

* [ArcGIS for JavaScript API Resource Center](http://help.arcgis.com/en/webapi/javascript/arcgis/index.html)
* [ArcGIS Blog](http://blogs.esri.com/esri/arcgis/)
* [twitter@esri](http://twitter.com/esri)

## Issues

Find a bug or want to request a new feature?  Please let us know by submitting an issue.

## Contributing

Anyone and everyone is welcome to contribute.

## Licensing
Copyright 2012 Esri

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

A copy of the license is available in the repository's [license.txt](https://raw.github.com/Esri/geocoder-search-widget-js/master/license.txt) file.

[](Esri Tags: ArcGIS JavaScript API Dijit module swipe Widget Public swipemap LayerSwipe)
[](Esri Language: JavaScript)