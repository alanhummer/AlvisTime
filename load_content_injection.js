loadConfig("le-alvis-time-onsite.json", function(response) { 
    //See if it was bogus
    if (response == null || typeof response === 'undefined' || response.length <= 0) {
        //Bogus
        //We do not have an org key, get one
        alert("BOGUS");
    }
    else {
        //Get all of our config parameters
        orgKey = "le-alvis-time-onsite";
        config = JSON.parse(response); 
        
        //Get it, so put listner on DOM loaded event
        mainControlThread();
    }
});

//For loading JSON file locally - simulate REST API till we get one
function loadConfig(inputFileName, callback) {   

    try {
        var xobj = new XMLHttpRequest();

        xobj.overrideMimeType("application/json");
        xobj.open('GET', inputFileName, true); 
        xobj.onreadystatechange = function () {
                if (xobj.readyState == 4 && xobj.status == "200") {
                    // Required use of an anonymous callback as .open will NOT return a value but simply returns undefined in asynchronous mode
                    callback(xobj.responseText);
                }
                else {
                    callback("");
                }
        };
        
        xobj.send(null);  
    }
    catch {
        callback("");
    }
}    

function mainControlThread() {

    var s = document.createElement('script');
    // TODO: add "script.js" to web_accessible_resources in manifest.json
    s.src = chrome.runtime.getURL(config.orgLegacyTimeIntegration.legacyIngegrationScript);
    s.onload = function() {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(s);

}

