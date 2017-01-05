var bidfactory = require('../bidfactory.js');
var bidmanager = require('../bidmanager.js');
var adloader = require('../adloader.js');

var StickyAdsTVAdapter = function StickyAdsTVAdapter() {

  var MUSTANG_URL = "http://cdn.stickyadstv.com/mustang/mustang.min.js";
  var INTEXTROLL_URL = "http://cdn.stickyadstv.com/prime-time/intext-roll.min.js";
  var SCREENROLL_URL = "http://cdn.stickyadstv.com/prime-time/screen-roll.min.js";
  
  window.stickyadstv_cache = {};

  function _callBids(params) {
     
    var bids = params.bids || [];
    for (var i = 0; i < bids.length; i++) {
      var bid = bids[i];
      // Send out bid request for each bid given its tag IDs and query strings
      sendBidRequest(bid);

    }
  }

  function sendBidRequest(bid){

    var placementCode = bid.placementCode;

    var integrationType = bid.params.format ? bid.params.format : "inbanner"; 
    var urltoLoad = MUSTANG_URL;

    if(integrationType === "intext-roll"){
      urltoLoad = INTEXTROLL_URL;
    }
    if(integrationType === "screen-roll"){
      urltoLoad = SCREENROLL_URL;
    }

    var bidRegistered = false;
    adloader.loadScript(urltoLoad, function(){

      getBid(bid, function(bidObject){
        if(!bidRegistered){
          bidRegistered = true;
          onBidReceived(placementCode, bidObject);
        }
        
      });
    }, true);
  }

  function getBid(bid, callback){
    var zoneId = bid.params.zoneId || bid.params.zone; //accept both
    var size = getBiggerSize(bid.sizes);

    var vastLoader = new window.com.stickyadstv.vast.VastLoader();
    bid.vast = window.stickyadstv_cache[bid.placementCode] = vastLoader.getVast();

    var vastCallback = {
      onSuccess : bind(function(){
        //'this' is the bid here
        var bid = this;
        
        var adHtml = formatAdHTML(bid,size);
        var price = extractPrice(bid.vast);

        callback(formatBidObject(true, price, adHtml, size[0], size[1]));
        
      },bid),
      onError : bind(function(){
        callback(formatBidObject(false));
      },bid)
    };

    var config = {
      zoneId:zoneId,
      playerSize:size[0]+"x"+size[1],
      vastUrlParams: bid.params.vastUrlParams,
      componentId: "prebid-sticky-"+bid.params.format
    };

    if(bid.params.format === "screen-roll"){
      //in screenroll case we never use the original div size.
      config.playerSize = window.com.stickyadstv.screenroll.getPlayerSize();
    }
    
    vastLoader.load(config, vastCallback);
  }

  function getBiggerSize(array){
    var result = [1,1];
    for(var i = 0; i< array.length; i++){
      if(array[i][0]*array[i][1] > result[0]*result[1]){
        result = array[i];
      }
    }
    return result;
  }
  
  var formatInBannerHTML = function(bid,size){
    var placementCode = bid.placementCode;
    
    var divHtml = "<div id=\"stickyadstv_prebid_target\"></div>";

    var script = "<script type='text/javascript'>"+
       
    "var vast =  window.top.stickyadstv_cache[\""+placementCode+"\"];"+
    "var config = {"+
    "  preloadedVast:vast,"+
    "  autoPlay:true"+
    "};"+
    "var ad = new window.top.com.stickyadstv.vpaid.Ad(document.getElementById(\"stickyadstv_prebid_target\"),config);"+
    "ad.initAd("+size[0]+","+size[1]+",\"\",0,\"\",\"\");"+

    "</script>";

    return divHtml+script;
  };

  var formatIntextHTML = function(bid){
    var placementCode = bid.placementCode;

    var config = bid.params;

    //default placement if no placement is set
    if(!config.hasOwnProperty("domId") && !config.hasOwnProperty("auto") && !config.hasOwnProperty("p") && !config.hasOwnProperty("article")){
      config.domId = placementCode;
    }

    var script = "<script type='text/javascript'>"+
        
    "var vast =  window.top.stickyadstv_cache[\""+placementCode+"\"];"+
    "var config = {"+
    "  preloadedVast:vast";

    for(var key in config){
      //dont' send format parameter
      //neither zone nor vastUrlParams value as Vast is already loaded
      if(config.hasOwnProperty(key) && key !== "format" && key !== "zone" && key !== "zoneId" && key !== "vastUrlParams"){

        script += ","+key+":\""+config[key]+"\"";
      }
    }
    script += "};"+
    
    "window.top.com.stickyadstv.intextroll.start(config);"+

    "</script>";

    return script;
  };

  var formatScreenRollHTML = function(bid){
    var placementCode = bid.placementCode;

    var config = bid.params;

    var script = "<script type='text/javascript'>"+
       
    "var vast =  window.top.stickyadstv_cache[\""+placementCode+"\"];"+
    "var config = {"+
    "  preloadedVast:vast";

    for(var key in config){
      //dont' send format parameter
      //neither zone nor vastUrlParams values as Vast is already loaded
      if(config.hasOwnProperty(key) && key !== "format" && key !== "zone" && key !== "zoneId" && key !== "vastUrlParams"){

        script += ","+key+":\""+config[key]+"\"";
      }
    }
    script += "};"+
    
    "window.top.com.stickyadstv.screenroll.start(config);"+

    "</script>";

    return script;
  };

  function formatAdHTML(bid, size){

    var integrationType = bid.params.format;

    var html = "";
    if(integrationType === "intext-roll"){
      html = formatIntextHTML(bid);
    }
    else if(integrationType === "screen-roll"){
      html = formatScreenRollHTML(bid);
    }
    else {
      html = formatInBannerHTML(bid,size);
    }
    
    return html;
  }
  

  function extractPrice(vast){
    var priceData = vast.getPricing();

    if(!priceData)
    {
      console.warn("StickyAdsTV: Bid pricing Can't be retreived. You may need to enable pricing on you're zone. Please get in touch with your sticky contact.");
    }
    
    return priceData;
  }

  function formatBidObject(valid, priceData, html, width, height){
    var bidObject;
    if(valid && priceData) {
      // valid bid response
      bidObject = bidfactory.createBid(1);
      bidObject.bidderCode = 'stickyadstv';
      bidObject.cpm = priceData.price;
      bidObject.currencyCode = priceData.currency;
      bidObject.ad = html;
      bidObject.width = width;
      bidObject.height = height;
      
    }
    else {
      // invalid bid response
      bidObject = bidfactory.createBid(2);
      bidObject.bidderCode = 'stickyadstv';
    }
    return bidObject;
  }

  function onBidReceived(placementCode, bidObject){

    console.log("Add Bid response:"+ bidObject);
    // send the bidResponse object to bid manager with the adUnitCode.
    bidmanager.addBidResponse(placementCode, bidObject);

  }

  /* Create a function bound to a given object (assigning `this`, and arguments,
   * optionally). Binding with arguments is also known as `curry`.
   * Delegates to **ECMAScript 5**'s native `Function.bind` if available.
   * We check for `func.bind` first, to fail fast when `func` is undefined.
   *
   * @param {function} func
   * @param {optional} context
   * @param {...any} var_args 
   * @return {function}
   */
  var bind = function(func, context) {

    return function() {         
      return func.apply(context,arguments);
    };
  };

  // Export the callBids function, so that prebid.js can execute
  // this function when the page asks to send out bid requests.
  return {
    callBids: _callBids
  };
};

module.exports = StickyAdsTVAdapter;