define([
    "dojo/Evented",
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/has",
    "esri/kernel",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dojo/on",
    // load template
    "dojo/text!application/dijit/templates/LayerSwipe.html",
    "dojo/i18n!application/nls/jsapi",
    "dojo/dom-class",
    "dojo/dom-style",
    "dojo/dnd/move",
    "dojo/dnd/Mover",
    "dojo/sniff",
    "dojo/dom-geometry",
    "esri/geometry/Point",
    "dojo/dom-construct",
    "dojo/Deferred",
    "dojo/promise/all"
],
function (
    Evented,
    declare,
    lang,
    has, esriNS,
    _WidgetBase, _TemplatedMixin,
    on,
    dijitTemplate, i18n,
    domClass, domStyle,
    move,
    Mover,
    sniff,
    domGeom,
    Point,
    domConstruct,
    Deferred,
    all
) {
    // patch subclass Mover and patch onFirstMove so that the swipe handle 
    // doesn't jump when first moved
    // remove if Dojo fixes this:  https://bugs.dojotoolkit.org/ticket/15322
    // patchedMover is used three times in _setSwipeType
    // 
    // fix is in the default switch case:
    //      l = m.l;
    //      t = m.t;
    var patchedMover = declare([Mover], {
        onFirstMove: function(e) {
            var s = this.node.style,
                l, t, h = this.host;
            switch (s.position) {
            case "relative":
            case "absolute":
                l = Math.round(parseFloat(s.left)) || 0;
                t = Math.round(parseFloat(s.top)) || 0;
                break;
            default:
                s.position = "absolute"; // enforcing the absolute mode
                var m = domGeom.getMarginBox(this.node);
                l = m.l;
                t = m.t;
                break;
            }
            this.marginBox.l = l - this.marginBox.l;
            this.marginBox.t = t - this.marginBox.t;
            if (h && h.onFirstMove) {
                h.onFirstMove(this, e);
            }
            // Disconnect touch.move that call this function
            this.events.shift().remove();
        }
    });
    var Widget = declare([_WidgetBase, _TemplatedMixin, Evented], {
        declaredClass: "esri.dijit.LayerSwipe",
        templateString: dijitTemplate,
        options: {
            theme: "LayerSwipe",
            layers: [],
            enabled: true,
            type: "vertical",
            ltr: true,
            ttb: true,
            clip: 9
        },
        // lifecycle: 1
        constructor: function(options, srcRefNode) {
            // mix in settings and defaults
            var defaults = lang.mixin({}, this.options, options);
            // widget node
            this.domNode = srcRefNode;
            this._i18n = i18n;
            // properties
            this.set("map", defaults.map);
            this.set("layers", defaults.layers);
            this.set("top", defaults.top);
            this.set("left", defaults.left);
            this.set("theme", defaults.theme);
            this.set("enabled", defaults.enabled);
            this.set("type", defaults.type);
            this.set("clip", defaults.clip);
            this.set("ltr", defaults.ltr);
            this.set("ttb", defaults.ttb);
            // listeners
            this.watch("theme", this._updateThemeWatch);
            this.watch("enabled", this._enabled);
            this.watch("type", this._type);
            this.watch("ltr", this._ltr);
            this.watch("ttb", this._ttb);
            // classes
            this._css = {
                handleContainer: "handleContainer",
                handle: "handle"
            };
            // event listeners array
            this._listeners = [];
        },
        // start widget. called by user
        startup: function() {
            // map not defined
            if (!this.map) {
                this.destroy();
                console.log('LayerSwipe::map required');
            }
            // set layers
            this.set("layers", this.layers);
            // no layers set
            if (!this.layers.length) {
                this.destroy();
                console.log('LayerSwipe::layer required');
            }
            // wait until all layers are loaded and map is loaded
            this._allLoaded().then(lang.hitch(this, function() {
                this._init();
            }), function(error){
                console.log('LayerSwipe::' + error.message);
            });
        },
        // connections/subscriptions will be cleaned up during the destroy() lifecycle phase
        destroy: function() {
            this._removeEvents();
            this._unclipLayers();
            this.inherited(arguments);
        },
        swipe: function() {
            this._setClipValue();
            this._swipe();
        },
        /* ---------------- */
        /* Public Events */
        /* ---------------- */
        // load
        // swipe
        /* ---------------- */
        /* Public Functions */
        /* ---------------- */
        enable: function() {
            this.set("enabled", true);
        },
        disable: function() {
            this.set("enabled", false);
        },
        /* ---------------- */
        /* Private Functions */
        /* ---------------- */
        _allLoaded: function() {
            var loadPromises = [];
            // all layers
            for (var i = 0; i < this.layers.length; i++) {
                // if layers are set by ID string
                if (typeof this.layers[i] === 'string') {
                    // get layer
                    this.layers[i] = this.map.getLayer(this.layers[i]);
                    // if we dont have a layer
                    if (!this.layers[i]) {
                        console.log('LayerSwipe::Could not get layer by ID');
                    }
                }
                // layer deferred
                var def = new Deferred();
                // if layer isn't loaded
                if (!this.layers[i].loaded) {
                    this._layerLoadedPromise(i, def);
                } else {
                    def.resolve('layer loaded');
                }
                loadPromises.push(def.promise);
            }
            var mapLoadDef = new Deferred();
            // if map is not loaded
            if (!this.map.loaded) {
                // when map is loaded
                on.once(this.map, "load", lang.hitch(this, function() {
                    mapLoadDef.resolve('map loaded');
                }));
            } else {
                mapLoadDef.resolve('map loaded');
            }
            loadPromises.push(mapLoadDef.promise);
            return all(loadPromises);
        },
        _layerLoadedPromise: function(i, def) {
            on.once(this.layers[i], 'load', function() {
                def.resolve('layer loaded');
            });
        },
        _mb: function() {
            // set containing coordinates for scope type
            var mapBox = domGeom.getMarginBox(this.map.root);
            var b = {};
            b.t = 0;
            b.l = 0;
            b.w = mapBox.l + mapBox.w;
            b.h = mapBox.h + mapBox.t;
            return b;
        },
        _setInitialPosition: function(){
            var left, top, swipeType, moveBox, cTop, cLeft;
            swipeType = this.get("type");
            moveBox = domGeom.getMarginBox(this._moveableNode);
            cTop = this.get("top");
            cLeft = this.get("left");
            // scope type
            if (swipeType === "scope") {
                // set initial position
                left = (this.map.width / 2) - (moveBox.w / 2);
                top = (this.map.height / 2) - (moveBox.h / 2);
                // use positions if set on widget
                if (typeof cTop !== 'undefined') {
                    top = cTop;
                }
                if (typeof cLeft !== 'undefined') {
                    left = cLeft;
                }
                // horizontal type
            } else if (swipeType === "horizontal") {
                // set initial position
                left = 0;
                top = (this.map.height / 4) - (moveBox.h / 2);
                // use positions if set on widget
                if (typeof cTop !== 'undefined') {
                    top = cTop;
                }
                // set clip var
                this._clipval = top;
                // vertical type
            } else {
                // set initial position
                left = (this.map.width / 4) - (moveBox.w / 2);
                top = 0;
                // use positions if set on widget
                if (typeof cLeft !== 'undefined') {
                    left = cLeft;
                }
                // set clip var
                this._clipval = left;
            }
            // set position
            domStyle.set(this._moveableNode, {
                top: top + "px",
                left: left + "px"
            });
        },
        _setSwipeType: function() {
            // set the type
            var swipeType = this.get("type");
            if (swipeType) {
                // destroy existing swipe mover
                if (this._swipeslider) {
                    this._swipeslider.destroy();
                }
                // add type class to movable node
                domClass.add(this._moveableNode, swipeType);
                // scope type
                if (swipeType === "scope") {
                    // create movable
                    this._swipeslider = new move.constrainedMoveable(this._moveableNode, {
                        handle: this._moveableNode.id,
                        constraints: lang.hitch(this, this._mb),
                        within: true,
                        mover: patchedMover
                    });
                    // horizontal type
                } else if (swipeType === "horizontal") {
                    // create movable
                    this._swipeslider = new move.parentConstrainedMoveable(this._moveableNode, {
                        area: "content",
                        within: true,
                        mover: patchedMover
                    });
                } else {
                    // create movable
                    this._swipeslider = new move.parentConstrainedMoveable(this._moveableNode, {
                        area: "content",
                        within: true,
                        mover: patchedMover
                    });
                }
                this._setInitialPosition();
            }
        },
        _init: function() {
            // set type of swipe
            this._setSwipeType();
            // events
            this._setupEvents();
            // check if not enabled
            this._enabled();
            // we're ready
            this.set("loaded", true);
            this.emit("load", {});
            // giddyup
            this.swipe();
        },
        _removeEvents: function() {
            if (this._listeners && this._listeners.length) {
                for (var i = 0; i < this._listeners.length; i++) {
                    if (this._listeners[i]) {
                        this._listeners[i].remove();
                    }
                }
            }
            this._listeners = [];
        },
        _setClipValue: function() {
            var moveBox = domGeom.getMarginBox(this._moveableNode);
            var swipeType = this.get("type");
            if (swipeType === "vertical") {
                var leftInt = moveBox.l;
                if (leftInt <= 0) {
                    this._clipval = 0;
                } else if (leftInt >= this.map.width) {
                    this._clipval = this.map.width;
                } else {
                    this._clipval = leftInt;
                }
            } else if (swipeType === "horizontal") {
                var topInt = moveBox.t;
                if (topInt <= 0) {
                    this._clipval = 0;
                } else if (topInt >= this.map.height) {
                    this._clipval = this.map.height;
                } else {
                    this._clipval = topInt;
                }
            }
        },
        _setupEvents: function() {
            this._removeEvents();
            // map resized
            this._mapResize = on.pausable(this.map, 'resize', lang.hitch(this, function() {
                // be responsive. Don't let the slider get outside of map
                // todo
                //this._setInitialPosition();
            }));
            this._listeners.push(this._mapResize);
            // swipe move
            this._swipeMove = on.pausable(this._swipeslider, 'Move', lang.hitch(this, function() {
                this.swipe();
            }));
            this._listeners.push(this._swipeMove);
            // done panning
            this._swipePanEnd = on.pausable(this.map, 'pan-end', lang.hitch(this, function() {
                this._swipe();
            }));
            this._listeners.push(this._swipePanEnd);
            // map graphics start update
            this._mapUpdateStart = on.pausable(this.map, 'update-start', lang.hitch(this, function() {
                this._swipe();
            }));
            this._listeners.push(this._mapUpdateStart);
            // map graphics have been updated
            this._mapUpdateEnd = on.pausable(this.map, 'update-end', lang.hitch(this, function() {
                this._swipe();
            }));
            this._listeners.push(this._mapUpdateEnd);
            // css panning
            this._swipePan = on.pausable(this.map, 'pan', lang.hitch(this, function() {
                this._swipe();
            }));
            this._listeners.push(this._swipePan);
            // scope has been clicked
            this._toolClick = on.pausable(this._moveableNode, 'click', lang.hitch(this, function(evt) {
                if (this.get("type") === "scope") {
                    if (this.map.hasOwnProperty('onClick') && typeof this.map.onClick === 'function' && this._clickCoords && this._clickCoords.x === evt.x && this._clickCoords.y === evt.y) {
                        var position = domGeom.position(this.map.root, true);
                        var x = evt.pageX - position.x;
                        var y = evt.pageY - position.y;
                        evt.x = x;
                        evt.y = y;
                        evt.screenPoint = {
                            x: x,
                            y: y
                        };
                        evt.type = "click";
                        evt.mapPoint = this.map.toMap(new Point(x, y, this.map.spatialReference));
                        this.map.onClick(evt, "other");
                    }
                    this._clickCoords = null;
                }
            }));
            this._listeners.push(this._toolClick);
            // scope mouse down click
            this._evtCoords = on.pausable(this._swipeslider, "MouseDown", lang.hitch(this, function(evt) {
                if (this.get("type") === "scope") {
                    this._clickCoords = {
                        x: evt.x,
                        y: evt.y
                    };
                }
            }));
            this._listeners.push(this._evtCoords);
        },
        _swipe: function() {
            if (this.get("loaded") && this.get("enabled")) {
                var emitObj = {
                    layers: []
                };
                if (this.layers && this.layers.length) {
                    // each layer
                    for (var i = 0; i < this.layers.length; i++) {
                        // layer node div
                        var layerNode = this.layers[i]._div;
                        // layer graphics
                        var layerGraphics = this.layers[i].graphics;
                        // position and extent variables
                        var rightval, leftval, topval, bottomval, layerBox, moveBox, mapBox, clip, swipeType, ltr, ttb;
                        clip = this.get("clip");
                        swipeType = this.get("type");
                        ltr = this.get("ltr");
                        ttb = this.get("ttb");
                        // movable node position
                        moveBox = domGeom.getMarginBox(this._moveableNode);
                        // vertical and horizontal nodes
                        if (swipeType === "vertical" || swipeType === "horizontal") {
                            // if layer has a div
                            if (layerNode) {
                                // get layer node position
                                layerBox = domGeom.getMarginBox(layerNode);
                            }
                            // map node position
                            mapBox = domGeom.getMarginBox(this.map.root);
                        }
                        if (swipeType === "vertical") {
                            if(ltr){
                                if (layerBox && layerBox.l > 0) {
                                    // leftval is greater than zero
                                    leftval = -(layerBox.l);
                                    rightval = this._clipval - Math.abs(layerBox.l);
                                } else if (layerBox && layerBox.l < 0) {
                                    // leftval is less than zero
                                    leftval = 0;
                                    rightval = this._clipval + Math.abs(layerBox.l);
                                } else {
                                    // leftval is ok
                                    leftval = 0;
                                    rightval = this._clipval;
                                }
                            }
                            else{
                                if (layerBox && layerBox.l > 0) {
                                    // leftval is less than zero
                                    // todo
                                    //leftval = -(layerBox.l);
                                    //rightval = this._clipval - Math.abs(layerBox.l);
                                } else if (layerBox && layerBox.l < 0) {
                                    // leftval is greater than map width
                                    // todo
                                    //leftval = 0;
                                    //rightval = this.map.width - this._clipval;
                                } else {
                                    // leftval is ok
                                    leftval = this._clipval;
                                    rightval = this.map.width;
                                }
                            }
                            if (layerBox && layerBox.t > 0) {
                                topval = -(layerBox.t);
                                bottomval = mapBox.h - layerBox.t;
                            } else if (layerBox && layerBox.t < 0) {
                                topval = 0;
                                bottomval = mapBox.h + Math.abs(layerBox.t);
                            } else {
                                topval = 0;
                                bottomval = mapBox.h;
                            }
                        } else if (swipeType === "horizontal") {
                            if (layerBox && layerBox.t > 0) {
                                bottomval = this._clipval - Math.abs(layerBox.t);
                                topval = -(layerBox.t);
                            } else if (layerBox && layerBox.t < 0) {
                                topval = 0;
                                bottomval = this._clipval + Math.abs(layerBox.t);
                            } else {
                                topval = 0;
                                bottomval = this._clipval;
                            }
                            if (layerBox && layerBox.l > 0) {
                                leftval = -(layerBox.l);
                                rightval = mapBox.w - layerBox.l;
                            } else if (layerBox && layerBox.l < 0) {
                                leftval = 0;
                                rightval = mapBox.w + Math.abs(layerBox.l);
                            } else {
                                leftval = 0;
                                rightval = mapBox.w;
                            }
                        } else if (swipeType === "scope") {
                            // graphics layer svg
                            if (layerGraphics) {
                                leftval = moveBox.l;
                                rightval = moveBox.w;
                                topval = moveBox.t;
                                bottomval = moveBox.h;
                                if (typeof clip !== 'undefined') {
                                    leftval += clip;
                                    rightval += -(clip * 2);
                                    topval += clip;
                                    bottomval += -(clip * 2);
                                }
                            }
                            // div layer
                            else {
                                leftval = moveBox.l;
                                rightval = leftval + moveBox.w;
                                topval = moveBox.t;
                                bottomval = topval + moveBox.h;
                                if (typeof clip !== 'undefined') {
                                    leftval += clip;
                                    rightval += -clip;
                                    topval += clip;
                                    bottomval += -clip;
                                }
                            }
                        }
                        // if layer has (_div)
                        if (layerNode) {
                            // graphics layer
                            if (layerGraphics) {
                                // get layer transform
                                var tr = layerNode.getTransform();
                                // if we got the transform object
                                if (tr) {
                                    // if layer is offset x
                                    if (tr.hasOwnProperty('dx')) {
                                        leftval += -(tr.dx);
                                    }
                                    // if layer is offset y
                                    if (tr.hasOwnProperty('dy')) {
                                        topval += -(tr.dy);
                                    }
                                }
                                // set clip on graphics layer
                                layerNode.setClip({
                                    x: leftval,
                                    y: topval,
                                    width: rightval,
                                    height: bottomval
                                });
                                // Non graphics layer
                            } else {
                                // If CSS Transformation is applied to the layer (i.e. swipediv),
                                // record the amount of translation and adjust clip rect
                                // accordingly
                                var divStyle = layerNode.style, ty = 0, tx = 0;
                                // clip div
                                if (typeof rightval !== 'undefined' && typeof leftval !== 'undefined' && typeof topval !== 'undefined' && typeof bottomval !== 'undefined') {
                                    // css3 transform support
                                    if (this.map.navigationMode === "css-transforms") {
                                        // if style exists
                                        if (divStyle) {
                                            // get vendor transform value
                                            var transformValue = this._getTransformValue(divStyle);
                                            // if we have the transform values
                                            if (transformValue) {
                                                if (transformValue.toLowerCase().indexOf("translate3d") !== -1) {
                                                    // get 3d version of translate
                                                    transformValue = transformValue.replace("translate3d(", "").replace(")", "").replace(/px/ig, "").replace(/\s/i, "").split(",");
                                                }
                                                else if (transformValue.toLowerCase().indexOf("translate") !== -1) {
                                                    // get 2d version of translate
                                                    transformValue = transformValue.replace("translate(", "").replace(")", "").replace(/px/ig, "").replace(/\s/i, "").split(",");
                                                }
                                                try {
                                                    // see if we can parse them as floats
                                                    tx = parseFloat(transformValue[0]);
                                                    ty = parseFloat(transformValue[1]);
                                                } catch (e) {
                                                    // something went wrong
                                                    console.error(e);
                                                }
                                                // set values
                                                leftval -= tx;
                                                rightval -= tx;
                                                topval -= ty;
                                                bottomval -= ty;
                                            }
                                        }
                                    }
                                    else{
                                        // no css3 transform
                                        if (divStyle) {
                                            try {
                                               tx = parseFloat(divStyle.getPropertyValue("left").replace(/px/ig, "").replace(/\s/i, ""));
                                               ty = parseFloat(divStyle.getPropertyValue("top").replace(/px/ig, "").replace(/\s/i, ""));
                                            } catch (e) {
                                                console.error(e);
                                            }
                                            leftval -= tx;
                                            rightval -= tx;
                                            topval -= ty;
                                            bottomval -= ty;
                                        }
                                    }
                                    // CSS Clip rectangle
                                    var clipstring;
                                    var ie = sniff('ie');
                                    // if IE and less than ie8
                                    if (ie && ie < 8) {
                                        //Syntax for clip "rect(top right bottom left)"
                                        clipstring = "rect(" + topval + "px " + rightval + "px " + bottomval + "px " + leftval + "px)";
                                    } else {
                                        //Syntax for clip "rect(top, right, bottom, left)"
                                        clipstring = "rect(" + topval + "px, " + rightval + "px, " + bottomval + "px, " + leftval + "px)";
                                    }
                                    domStyle.set(layerNode, "clip", clipstring);
                                }
                            }
                        } else {
                            // no layerNode
                            console.log('LayerSwipe::Invalid layer type');
                        }
                        var layerEmit = {
                            layer: this.layers[i],
                            left: leftval,
                            right: rightval,
                            top: topval,
                            bottom: bottomval
                        };
                        emitObj.layers.push(layerEmit);
                    }
                }
                this.emit("swipe", emitObj);
            }
        },
        _getTransformValue: function(nodeStyle){
            var transformValue, vendors;
            if(nodeStyle){
                vendors = [
                    "transform",
                    "-webkit-transform",
                    "-moz-transform",
                    "-ms-transform",
                    "-o-transform"
                ];
                for(var i = 0; i < vendors.length; i++){
                    transformValue = nodeStyle.getPropertyValue(vendors[i]);
                    if(transformValue){
                        break;
                    }
                }
            }
            return transformValue;
        },
        _updateThemeWatch: function(attr, oldVal, newVal) {
            domClass.remove(this.domNode, oldVal);
            domClass.add(this.domNode, newVal);
        },
        _type: function(attr, oldVal, newVal) {
            // remove old css class
            if (oldVal) {
                domClass.remove(this._moveableNode, oldVal);
            }
            // set type of swipe type
            this._setSwipeType();
            // remove and reset events
            this._setupEvents();
            // swipe new position
            this.swipe();
        },
        _pauseEvents: function() {
            if (this._listeners && this._listeners.length) {
                for (var i = 0; i < this._listeners.length; i++) {
                    this._listeners[i].pause();
                }
            }
        },
        _resumeEvents: function() {
            if (this._listeners && this._listeners.length) {
                for (var i = 0; i < this._listeners.length; i++) {
                    this._listeners[i].resume();
                }
            }
        },
        _unclipLayers: function() {
            if (this.get("loaded") && this.layers && this.layers.length) {
                for (var i = 0; i < this.layers.length; i++) {
                    // layer div
                    var layerNode = this.layers[i]._div;
                    // layer graphics
                    var layerGraphics = this.layers[i].graphics;
                    // layer node exists
                    if (layerNode) {
                        // graphics layer 
                        if (layerGraphics) {
                            layerNode.setClip(null);
                        }
                        // if we have a layer div and its not a graphics layer
                        else {
                            var clipstring;
                            // test for IE
                            var ie = sniff('ie');
                            // if IE and less than ie8
                            if (ie && ie < 8) {
                                clipstring = "rect(auto auto auto auto)";
                            } else {
                                clipstring = "auto";
                            }
                            domStyle.set(layerNode, "clip", clipstring);
                        }
                    }
                }
            }
        },
        _ltr: function(){
            this.swipe();  
        },
        _ttb: function(){
            this.swipe();  
        },
        _enabled: function() {
            if (this.get("enabled")) {
                // widget enabled
                domStyle.set(this.domNode, 'display', 'block');
                // restart events
                this._resumeEvents();
                // swipe map
                this.swipe();
            } else {
                // pause all events
                this._pauseEvents();
                // hide widget div
                domStyle.set(this.domNode, 'display', 'none');
                // unclip layers
                this._unclipLayers();
            }
        }
    });
    if (has("extend-esri")) {
        lang.setObject("dijit.LayerSwipe", Widget, esriNS);
    }
    return Widget;
});
