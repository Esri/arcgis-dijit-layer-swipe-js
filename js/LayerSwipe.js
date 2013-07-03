define([
    "dojo/_base/declare",
    "dijit/_WidgetBase",
    "dijit/_OnDijitClickMixin",
    "dijit/_TemplatedMixin",
    "dojo/on",
    // load template
    "dojo/text!./templates/LayerSwipe.html",
    "dojo/i18n!./nls/LayerSwipe",
    "dojo/dom",
    "dojo/dom-class",
    "dojo/dom-style",
    "dojo/dnd/move",
    "dojo/sniff",
    "dojo/dom-geometry"
],
function (
    declare,
    _WidgetBase, _OnDijitClickMixin, _TemplatedMixin,
    on,
    dijitTemplate, i18n,
    dom, domClass, domStyle,
    move,
    sniff,
    domGeom
) {
    return declare([_WidgetBase, _OnDijitClickMixin, _TemplatedMixin], {
        declaredClass: "modules.LayerSwipe",
        templateString: dijitTemplate,
        options: {
            theme: "LayerSwipe",
            map: null,
            layer: null,
            offset: null,
            enabled: true
        },
        // lifecycle: 1
        constructor: function(options, srcRefNode) {
            // mix in settings and defaults
            declare.safeMixin(this.options, options);
            // widget node
            this.domNode = srcRefNode;
            this._i18n = i18n;
            // properties
            this.set("map", this.options.map);
            this.set("layer", this.options.layer);
            this.set("offset", this.options.offset);
            this.set("theme", this.options.theme);
            this.set("enabled", this.options.enabled);
            // listeners
            this.watch("theme", this._updateThemeWatch);
            this.watch("visible", this._visible);
            this.watch("enabled", this._enabled);
            // classes
            this._css = {
                moveable: "moveable",
                handleContainer: "handleContainer",
                handle: "handle"
            };
            this._listeners = [];
        },
        // start widget. called by user
        startup: function() {
            var _self = this;        
            // map not defined
            if (!_self.map) {
                _self.destroy();
                return new Error('map required');
            }
            if(typeof _self.layer === 'string'){
                _self.set("layer", _self.map.getLayer(_self.layer));
            }
            if (!_self.layer) {
                _self.destroy();
                return new Error('layer required');
            }
            this.set("visible", this.get("layer").visible);
            // when map is loaded
            if (_self.map.loaded) {
                _self._init();
            } else {
                on.once(_self.map, "load", function() {
                    _self._init();
                });
            }
        },
        // connections/subscriptions will be cleaned up during the destroy() lifecycle phase
        destroy: function() {
            this._removeEvents();
            this.inherited(arguments);
        },
        /* ---------------- */
        /* Public Events */
        /* ---------------- */
        onLoad: function() {
            this.set("loaded", true);
        },
        /* ---------------- */
        /* Public Functions */
        /* ---------------- */
        show: function() {
            this.set("visible", true);
        },
        hide: function() {
            this.set("visible", false);
        },
        enable: function() {
            this.set("enabled", true);
        },
        disable: function() {
            this.set("enabled", false);
        },
        /* ---------------- */
        /* Private Functions */
        /* ---------------- */
        _init: function() {
            var _self = this;
            // load swipe
            _self._initSwipe();
            // set visibility
            _self._visible();
            // create movable
            _self._swipeslider = new move.parentConstrainedMoveable(_self._moveableNode, {
                area: "content",
                within: true
            });
            // set initial position
            var marginBox = domGeom.getMarginBox(_self._moveableNode);
            var left = parseInt((this.map.width / 4) - (marginBox.w / 2), 10) + "px";
            if (this.get("offset")) {
                left = this.get("offset") + "px";
            }
            domStyle.set(_self._swipeslider.node, {
                height: _self.map.height + "px",
                top: "0px",
                left: left
            });
            // set clip var
            _self._clipval = left;
            // swipe it
            _self._swipe(_self._clipval);
            // clip it
            _self._clipLayer();
            // we're ready
            _self.onLoad();
        },
        _removeEvents: function() {
            if (this._listeners.length) {
                for (var i = 0; i < this._listeners.length; i++) {
                    this._listeners[i].remove();
                }
            }
            this._listeners = [];
        },
        _setClipValue: function() {
            domStyle.set(this._swipeslider.node, "top", "0px"); //needed to avoid offset
            var left = domStyle.get(this._swipeslider.node, "left");
            var leftInt = parseInt(left, 10);
            if (leftInt <= 0 || leftInt >= (this.map.width)) {
                return;
            }
            this._clipval = left;
        },
        _clipLayer: function() {
            var _self = this;
            _self._swipeMove = on.pausable(_self._swipeslider, 'Move', function() {
                _self._setClipValue();
                _self._swipe(_self._clipval);
            });
            this._listeners.push(_self._swipeMove);
            _self._swipePanEnd = on.pausable(_self.map, 'pan-end', function() {
                _self._swipe(_self._clipval);
            });
            this._listeners.push(_self._swipePanEnd);
            if (_self.map.navigationMode === "css-transforms") {
                _self._swipePan = on.pausable(_self.map, 'pan', function() {
                    _self._swipe(_self._clipval);
                });
                this._listeners.push(_self._swipePan);
            }
            _self._layerToggle = on(_self.get("layer"), 'visibility-change', function(e) {
                _self.set("visible", e.visible);
            });
            this._listeners.push(_self._layerToggle);
        },
        _initSwipe: function() {
            var _self = this;
            if (!this.get("layer")) {
                return;
            }
            _self._swipediv = this.get("layer")._div;
        },
        _swipe: function(val) {
            var _self = this;
            if (_self._swipediv) {
                var offset_left = parseFloat(domStyle.get(_self._swipediv, "left"));
                var offset_top = parseFloat(domStyle.get(_self._swipediv, "top"));
                var rightval, leftval, topval, bottomval;
                if (offset_left > 0) {
                    rightval = parseFloat(val) - Math.abs(offset_left);
                    leftval = -(offset_left);
                } else if (offset_left < 0) {
                    leftval = 0;
                    rightval = parseFloat(val) + Math.abs(offset_left);
                } else {
                    leftval = 0;
                    rightval = parseFloat(val);
                }
                if (offset_top > 0) {
                    topval = -(offset_top);
                    bottomval = _self.map.height - offset_top;
                } else if (offset_top < 0) {
                    topval = 0;
                    bottomval = _self.map.height + Math.abs(offset_top);
                } else {
                    topval = 0;
                    bottomval = _self.map.height;
                }
                // If CSS Transformation is applied to the layer (i.e. swipediv),
                // record the amount of translation and adjust clip rect
                // accordingly
                var tx = 0,
                    ty = 0;
                if (_self.map.navigationMode === "css-transforms") {
                    var prefix = "";
                    if (sniff("webkit")) {
                        prefix = "-webkit-";
                    }
                    if (sniff("ff")) {
                        prefix = "-moz-";
                    }
                    if (sniff("ie")) {
                        prefix = "-ms-";
                    }
                    if (sniff("opera")) {
                        prefix = "-o-";
                    }
                    var transformValue = _self._swipediv.style.getPropertyValue(prefix + "transform");
                    if (transformValue) {
                        if (transformValue.toLowerCase().indexOf("translate3d") !== -1) {
                            transformValue = transformValue.replace("translate3d(", "").replace(")", "").replace(/px/ig, "").replace(/\s/i, "").split(",");
                        } else if (transformValue.toLowerCase().indexOf("translate") !== -1) {
                            transformValue = transformValue.replace("translate(", "").replace(")", "").replace(/px/ig, "").replace(/\s/i, "").split(",");
                        }
                        try {
                            tx = parseFloat(transformValue[0]);
                            ty = parseFloat(transformValue[1]);
                        } catch (e) {
                            console.error(e);
                        }
                        leftval -= tx;
                        rightval -= tx;
                        topval -= ty;
                        bottomval -= ty;
                    }
                }
                //Syntax for clip "rect(top,right,bottom,left)"
                //var clipstring = "rect(0px " + val + "px " + map.height + "px " + " 0px)";
                var clipstring = "rect(" + topval + "px " + rightval + "px " + bottomval + "px " + leftval + "px)";
                domStyle.set(_self._swipediv, "clip", clipstring);
            }
        },
        _updateThemeWatch: function(attr, oldVal, newVal) {
            var _self = this;
            domClass.remove(_self.domNode, oldVal);
            domClass.add(_self.domNode, newVal);
        },
        _enabled: function() {
            if (this.get("enabled")) {
                this._clipLayer();
                this._setClipValue();
                this._swipe(this._clipval);
                this._swipeMove.resume();
                this._swipePanEnd.resume();
                if(this._swipePan){
                    this._swipePan.resume();
                }
                domStyle.set(this.domNode, 'display', 'block');
                this.get("layer").show();
            } else {
                this._swipeMove.pause();
                this._swipePanEnd.pause();
                if(this._swipePan){
                    this._swipePan.pause();
                }
                domStyle.set(this.domNode, 'display', 'none');
                var clipstring = sniff('ie') ? "rect(auto auto auto auto)" : "";
                domStyle.set(this._swipediv, "clip", clipstring);
            }
        },
        _visible: function() {
            if (this.get("visible")) {
                this.get("layer").show();
            } else {
                this.get("layer").hide();
            }
        }
    });
});