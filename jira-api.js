function JiraAPI (baseUrl, apiExtension, inputJQL) {

//AJH DIFF AUTH    function JiraAPI (baseUrl, apiExtension, username, password, jql) {
    var jql = inputJQL;

    var ACTIVE_REQUESTS = 0;

    var apiDefaults = {
        type: 'GET',
        url : baseUrl + apiExtension,
        headers: {
            'Content-Type': 'application/json'
//AJH DIFF AUTH 'Authorization': 'Basic ' + btoa(username + ':' + password)    
        },
        responseType: 'json',
        data: ''
    };

    return {
        setJQL: setJQL,
        getUser: getUser,
        getIssue : getIssue,
        getIssues: getIssues,
        getIssueWorklogs : getIssueWorklogs,
        updateWorklog : updateWorklog,
        loadJSON : loadJSON
    };

//AJH DIFF AUTH '   function login() {
//AJH DIFF AUTH '       var url = '/user?username=' + username;
//AJH DIFF AUTH '       var options = {
//AJH DIFF AUTH '           headers: {
//AJH DIFF AUTH 'Authorization': 'Basic ' + btoa(username + ':' + password)
//AJH DIFF AUTH '            }            
//AJH DIFF AUTH '        }
//AJH DIFF AUTH '        return ajaxWrapper(url, options);
//AJH DIFF AUTH '    };

    function setJQL (inputJQL) {
        jql = inputJQL;
        return true;
    }

    function getUser (id) {
        return ajaxWrapper('/myself');
    }

    function getIssue (id) {
        return ajaxWrapper('/issue/' + id);
    }

    function getIssues () {
        return ajaxWrapper('/search?jql=' + jql);
    }    

    function getIssueWorklogs (id, startDateInUNIXTimeFormat) {
        return ajaxWrapper('/issue/' + id + '/worklog?startedAfter=' + startDateInUNIXTimeFormat);
    }

    function updateWorklog (id, worklogId, worklogComment, timeSpent, started) {

        var url;
        var options;

        if (worklogId) {
            //if we havea  worklogId, then let's do update

            //If new value is 0, lets delete old worklog
            if (timeSpent == 0) {
                //Delete it since no hours
                url = '/issue/' + id + '/worklog/' + worklogId;
                options = {
                    type: "DELETE"
                }               
            }
            else {
                //else, update old worklog
                url = '/issue/' + id + '/worklog/' + worklogId;
                options = {
                    type: "PUT",
                    data: JSON.stringify({
                        "started": started,
                        "timeSpent": timeSpent + "h",
                        "comment": worklogComment
                    })
                }
            }

        }

        else {
            //if not, lets do insert
            url = '/issue/' + id + '/worklog';
            options = {
                type: 'POST',
                data: JSON.stringify({
                    "started": started,
                    "timeSpent": timeSpent + "h",
                    "comment": worklogComment
                })
            }
        }

        return ajaxWrapper(url, options);
    }

    function ajaxWrapper (urlExtension, optionsOverrides) {

        // merge default and override options
        var options = extend(apiDefaults, optionsOverrides || {});

        // concat url
        options.url += urlExtension;

        // return promise
        return new Promise(function(resolve, reject) {

            var req = new XMLHttpRequest();

            // open request
            req.open(options.type, options.url, true);

            // set response type (json)
            req.responseType = options.responseType;

            // on load logic
            req.onload = function() {

                // consider all statuses between 200 and 400 successful
                if (req.status >= 200 && req.status < 400) {
                    resolve(req.response); //I think i'd like to pass back a uniqu token here, some handle on the original send
                }
                // all other ones are considered to be errors
                else {
                    //reject(req.response, req.status, req.statusText);
                    reject({
                        response: req.response, 
                        status: req.status, 
                        statusText: req.statusText
                    });
                }

                // keep the count of active XMLHttpRequest objects
                if (!(--ACTIVE_REQUESTS)) {

                    //if it's 0 dispatch a global event
                    dispatchEvent('jiraStop', document);
                }

            };

            // Unpredicted error
            req.onerror = function() {
                reject({
                    response: undefined, 
                    status: undefined, 
                    statusText: 'Unknown Error'
                });
                dispatchEvent('jiraError', document);
            };

            // set all headers
            for(header in options.headers){
                req.setRequestHeader(header, options.headers[header]);
            }

            // send the request
            req.send(options.data);

            // increment the count of active XMLHttpRequest objects
            if (ACTIVE_REQUESTS++ === 0 ) {

                // if it's the first one in the queue, dispatch a global event
                dispatchEvent('jiraStart', document);
            }

        });

    }



    /*
        Helper functions
    */
    // Event dispatcher
    function dispatchEvent (name, element) {
        var event = new Event(name);
        element.dispatchEvent(event);
    }

    // Simple extend function
    function extend (target, overrides) {

        // new empty object
        var extended = Object.create(target);

        // copy all properties from default
        Object.keys(target).map(function (prop) {
            extended[prop] = target[prop];
        });

        // iterate through overrides
        Object.keys(overrides).map(function (prop) {

            // if the attribute is an object, extend it too
            if(typeof overrides[prop] === 'object'){
                extended[prop] = extend(extended[prop], overrides[prop]);
            }
            // otherwise just assign value to the extended object
            else{
                extended[prop] = overrides[prop];
            }
        });

        return extended;

    };

    //For loading JSON file locally - simulate REST API till we get one
    function loadJSON(inputFileName, callback) {   

        var xobj = new XMLHttpRequest();
  
        xobj.overrideMimeType("application/json");
        xobj.open('GET', inputFileName, true); 
        xobj.onreadystatechange = function () {
              if (xobj.readyState == 4 && xobj.status == "200") {
                // Required use of an anonymous callback as .open will NOT return a value but simply returns undefined in asynchronous mode
                callback(xobj.responseText);
              }
        };
        xobj.send(null);  
     }    

}