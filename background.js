//This logs to the BACKGROUND PAGE view, seperate debugger from the F12 console per page
//May want to convert this to use chrome.alarms

var userId;
var blnPollJira = false;
var blnAdmin = false;
var blnHaveTimecard = false;
var blnTestOverride = false;
var config;
var workgroup;
var user;
var JIRA;
var blnRemoteConfig = true;
//For legacy integration
var ltimeEntryIndex = 0;
var ltimeEntryArray = [];
var blnTabLoaded = false;
var saveTab;
var blnTabStatusComplete = false;

console.log("Alvis Time: Is started and running");

//Get our configuration, which will kick off the main thread when successful
loadKeyAndOrg();

/****************
Load our configuration and kick of the main processing thread on success
****************/
function loadKeyAndOrg() {

    //if we have the configuration laoded, use it.  Else abort, til next time
    chrome.storage.local.get("keyStorage", function(response) {

        //See if we got it or not
        if (response) {
            if (response.keyStorage) {
                //We got it, let's d this
                console.log("Alvis Time: Loading Org Key from cache");
                config = response.keyStorage;
                mainControlThread();  
            }  
            else {
              //No dice, abort
              console.log("Alvis Time: No org key storage yet defined.  Abort.");              
            }                
        }
        else {
            //No dice, abort
            console.log("Alvis Time: No org key storage yet defined.  Abort.");
        }
    });



    return true;

}


/****************
Main control thread - When we are set, do this routine
****************/ 
function mainControlThread() { 

    console.log("Alvis Time: Config loaded and we are running. Config;", JSON.parse(JSON.stringify(config)));
    
    JIRA = JiraAPI(config.orgJiraBaseURI, config.orgJiraAPIExtension, "");

    //Get User info - may want this in a loop/interval.  This starts when browser opens, and if not already logged into Jira, will fail
    //Idea is, to have it try again...then when you are logged in to Jira, it works
    JIRA.getUser()
        .then(onUserSuccess, onUserError);

}

/****************
Fetch for user was Successful -
****************/
function onUserSuccess(response) {

    if (response.accountId)
        userId = response.accountId;
    else    
        userId = response.key;

    blnPollJira = true;

    var userOptions;
    
    //Find the workgroup and user from config options
    for (var w=0;w<config.workgroups.length;w++) {
        for(var i=0;i<config.workgroups[w].users.length;i++) {
            if (config.workgroups[w].users[i].userid == userId) {
                if (typeof workgroup === 'undefined') {
                    workgroup = config.workgroups[w];
                    if (typeof user === 'undefined') {
                        user = workgroup.users[i];
                    }
                    else {
                        //Poblem - user is duplicated in config
                        console.log("Alvis Time: What to do? You are defined twice: " + workgroup.name + ":" + user.name + " and " + config.workgroups[w].name + ":" + config.workgroups[w].users[i].name + " Keeping: " + workgroup.name + ":" + user.name);
                    }
                }
                else {
                    //Poblem - user in more than 1 workgroup
                    console.log("Alvis Time: What to do? You are defined twice: " + workgroup.name + ":" + user.name + " and " + config.workgroups[w].name + "." + config.workgroups[w].users[i].name + " Keeping: " + workgroup.name + ":" + user.name);
                }
            }
        }
    }

    if (typeof workgroup === 'undefined' || typeof user == 'undefined') {
        console.log("Alvis Time: User not defined in any workgroup. Nothing to do here.");
    }
    else {

        if (user.role == "admin")
            blnAdmin = true;
        else
            blnAdmin = false;

        console.log("Alvis Time: You are in workgroup: " + workgroup.name + " and you are " + user.name + " who is admin:" + blnAdmin);

        //Poll by config frequency, test if a day and if in time window configured then every n hours - if defined in config
        if (workgroup.settings.timecardNotification.active) {
            checkForTimecards();
            var timecardPoll ;
            if (workgroup.settings.timecardNotification.frequency) { //in hours
                timecardPoll = setInterval(checkForTimecards, (workgroup.settings.timecardNotification.frequency * 3600) * 1000); //** RESET Poll every n hours checking for 1-6PM and then querying jira
            }
            else {
                timecardPoll = setInterval(checkForTimecards, 7200 * 1000); //** RESET Poll every 2 hours checking for 1-6PM and then querying jira
            }

        }

        //If admin, start a loop - pull however frequently, test if certaing day and if in time window  an initial check then every hour - if defined in config
        if (workgroup.settings.approvalNotification.active) {
            if (blnAdmin) {
                checkForApproval();
                var approvalPoll;
                if (workgroup.settings.approvalNotification.frequency) { //in hours
                    approvalPoll = setInterval(checkForApproval, (workgroup.settings.approvalNotification.frequency * 3600) * 1000); //** RESET Poll every hour checking for 1-6PM and then querying jira
                }
                else {
                    approvalPoll = setInterval(checkForApproval, 3600 * 1000); //** RESET Poll every hour checking for 1-6PM and then querying jira
                }
            }
        }

    }
    
}

/****************
Fetch for user failed -
****************/    
function onUserError(error) {
    console.log("Alvis Time: Failed to get user:", JSON.parse(JSON.stringify(error)));
    blnPollJira = false;
}

/****************
Approval check routine
****************/  
function checkForApproval() {

    //Get today timestamp to use for poll testing
    var today = new Date();

    //if we are during the working day
    if (today.getDay() >= workgroup.settings.timecardNotification.dayRangeLow && today.getDay() <= workgroup.settings.timecardNotification.dayRangeHigh ) { //Monday - Friday = 1-5
        if (today.getHours() >= workgroup.settings.timecardNotification.hourRangeLow && today.getHours() <= workgroup.settings.timecardNotification.hourRangeHigh || blnTestOverride) {    //If we are 9-6
            //for each users, see if they have a card to approve
            for(var i=0;i<workgroup.users.length;i++) {
                jiraTimeCardApprovalCheck(workgroup.users[i]);
            }
        }
    }
}

/****************
jiraTimeCardApprovalCheck
****************/
function jiraTimeCardApprovalCheck(inputUser) {

        //Get submitted cards by user
        console.log("Alvis Time: Polling for submitted/needs approval time cards for " + inputUser.name);

        //Setup our query
        var jql = "worklogComment ~ '" + inputUser.email + "|submitted'";
        JIRA.setJQL(jql);

        // fetch issues
        JIRA.getIssues(jql, {name: "background"})
        .then(function(response) {

            //If I let these site and queue up, do i hav eto click thru for each? Looks like mayb 2

            if (response.issues.length > 0)  {
                console.log("Alvis Time: We have a submitted card for: " + inputUser.name);
                if (confirm("We have a time card to approve for " + inputUser.name  + " .  Do you want to approve it now?")) {
                    chrome.windows.create({url: chrome.extension.getURL("popup.html"), type: "popup", height: 639, width:817}); //not sure whey this isnt aboslute, but have to adjust a little to match extenion launch size
                    console.log("Alvis Time: Approval found - loaded approval dialogue");               
                }
                else {
                    console.log("Alvis Time: Approval found - User cancelled reminder dialogue");     
                }
           }
            else {
                console.log("Alvis Time: We do not have any submitted cards for: " + inputUser.name);
            }
        }, function(error) {
            //Failure
            console.log("Alvis Time: Failed to get submitted cards for : " + inputUser.name);
        });
}



/****************
Timecard check routine
****************/  
function checkForTimecards() {

    //Get today timestamp to use for poll testing
    var today = new Date();

    //if we are Friday
    if ((today.getDay() == workgroup.settings.approvalNotification.dayRangeLow && today.getDay() <= workgroup.settings.approvalNotification.dayRangeHigh) || blnTestOverride) { //Friday = 5-5
        if (today.getHours() >= workgroup.settings.approvalNotification.hourRangeLow && today.getHours() <= workgroup.settings.approvalNotification.hourRangeHigh || blnTestOverride) {    //If we are in time range
            if (blnPollJira && !blnHaveTimecard) { //Just do this the one time where they say OK - not to be too pesky
                jiraTimeCardSubmittedCheck();
            }
        }
        else {
            //reset the pesky reminder but not timecards found..only reset that when day switches
            blnPollJira = true;
        }
    }
    else {
        //reset the pesky reminder and timecard found, as on different day - so will try again next Friday
        blnPollJira = true;
        blnHaveTimecard = false;
    }
    //cancel the polliing would be clearInterval(timecardPoll);
}



/****************
jiraTimeCardSubmitted
****************/
function jiraTimeCardSubmittedCheck() {

    //JIRA api is goofy, as you can't query for worklogs richly.  Query for issues and if any worklogs meet criteria, ie updates > date.  
    //Can query for worklogs updated since a date....then have to pull them down and interrogate them for userID and status
    //But Updated date is different from work started date. Could have updated datae in the past but work date this week and submitted
    //Really what I think i need to do is....gimme issues with worklog work date > start of time card week and not include user and "submitted" or "approved"
    //This would be perfect, except since not returning worklogs but issues, query ends up as or condition on thew work log (date or user or status)
    //Then get each issues worklogs, rip thru each one and check id+status

    //Poll jira for completed card

    //Get all issues with worklog since beginning of week

    //if found a timecard, get out
    if (blnHaveTimecard)
        return;
    
    //Get beginning of week
    var startDate = formatDate(getStartDay());
    console.log("Alvis Time: Polling for completed time cards since: " + startDate);

    //Setup our query
    var jql = "worklogDate >= " + startDate;
    JIRA.setJQL(jql);

    // fetch issues
    JIRA.getIssues(jql, {name: "background"})
    .then(onFetchSuccess, onFetchError);
      
}

/****************
Fetch for issues was Successful -
****************/
function onFetchSuccess(response) {
    
    var promptedUsers = ""; //Keep track of users we prompted for so as not to repeate
    var issues = response.issues;
    var issuesProcessed = 0;

    //For each issue, get worklogs started after worklog?startedAfter=1587186000
    issues.forEach(function(issue) {

        //Already found one, get out
        if (blnHaveTimecard)
            return;

        //Now get the worklogs and fill in the objects
        JIRA.getIssueWorklogs(issue.key, getStartDay().getTime() / 1000, {})
            .then(onWorklogFetchSuccess, onWorklogFetchError);

        //Got worklog successful
        function onWorklogFetchSuccess(response) {

            //Already found one, get out
            if (blnHaveTimecard)
                return;

            var worklogsProcessed = 0;

            response.worklogs.forEach(function(worklog) {
                
                //Already found one, get out
                if (blnHaveTimecard)
                    return;

                 worklogsProcessed++;
                
                //console.log("Worklog for " + issue.key + " + " + worklog.id + " is:" + worklog.comment + " time spent:" + (worklog.timeSpentSeconds/3600) + " start time: " + worklog.started);
                if (typeof worklog.comment != "undefined") {
                    //This is the normal check for user, if they submitted worklog
                    if (worklog.comment.includes(userId)) {
                        if (worklog.comment.includes("submitted") || worklog.comment.includes("approved")) {
                            //we have current week, user id, and a submitted time-card.  Done!
                            blnPollJira = false;
                            blnHaveTimecard = true;
                            console.log("Alvis Time: Found a timecard. All done.");
                            return;
                        }
                    }
                }

                if (worklogsProcessed == response.worklogs.length) {

                    //Let's keep track of if we are done
                    issuesProcessed++;

                    //console.log("DID ISSUES: " + issuesProcessed + "-" + issues.length + " WORKLOGS: " + worklogsProcessed + "-" + response.worklogs.length);

                    //See if we did the last worklog for the last issue
                    if (issuesProcessed == issues.length) {
                        //All done, lets see ewhat we have
                        if (blnHaveTimecard) {
                            //kill the polling interval - we are done
                            //clearInterval(hourlyPoll);  - actually dont do this...keep polling for when browser open for week
                            return;
                        }
                        else {
                            //No time card, so let's prompt em
                            
                            //If I let these site and queue up, do i hav eto click thru for each?  Looks like maybe 2

                            //Open dialogue to remind and solicit time card entries
                            if (confirm("You have not entered time yet for the week.  Deadline is 4PM Friday.  Do you want to enter it now?")) {
                                chrome.windows.create({url: chrome.extension.getURL("popup.html"), type: "popup", height: 639, width:817}); //not sure whey this isnt aboslute, but have to adjust a little to match extenion launch size
                                console.log("Alvis Time: No timecard found - loaded reminder dialogue");               
                            }
                            else {
                                console.log("Alvis Time:  No timecard found - User cancelled reminder dialogue");     
                            }
                            //Not to be to pesky turn this off til it resets...every hour?
                            //blnPollJira = false;
                        }
                    }
                }
            })
        }

        //Got worklog failed
        function onWorklogFetchError(error) {
            console.log("Alvis Time: TOOK ERROR LOADING WORKLOG: " + error);
        }
    });
}

/****************
Fetch for issues failed -
****************/    
function onFetchError(error) {
    //Log the error
    console.log("Alvis Time: TOOK ERROR LOADING ISSUES: " + error);
}

//Get the range of dates for the week, based on offset
function getStartDay() {
    var firstDay = new Date();
    var dayOfWeekOffset = firstDay.getDay() + 1;
    firstDay.setDate(firstDay.getDate() - dayOfWeekOffset);
    firstDay.setHours(0, 0, 0, 0); //This sets it to mignight morning of
    return firstDay;
}

//Format the date in yyyy-mm-dd
function formatDate(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;

    return [year, month, day].join('-');
}

//For loading JSON file locally - simulate REST API till we get one
function loadConfig(inputFileName, callback) {   

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

//For loading JSON file remotely - download a file
function getConfig(url, callback) {

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    console.log("JSONTEST GETTING:" + url);
    xhr.responseType = 'json';
    
    xhr.onload = function() {
    
        var status = xhr.status;
        console.log("STATUS: " + status);
        if (status == 200) {
            callback(null, xhr.response);
        } else {
            callback(status);
        }
    };
    
    xhr.send();
};


//Sleep function, like what every other language has
function sleep(inputMS) {
    let timeStart = new Date().getTime(); 
    while (true) { 
        let elapsedTime = new Date().getTime() - timeStart; 
        if (elapsedTime > inputMS) { 
        break; 
        } 
    } 
}

//************************************************
//************************************************
//************************************************
//**** Here are the listeners/relays *************
//**** For posting to tabs/legacy integraiton*****
//************************************************
//************************************************

//Add listener for messages from popup to laod URI to browser
chrome.runtime.onMessage.addListener(function(requestMessage) {
    //We have recieved a message: If it is for posting time, off we go 
    if( requestMessage.action === "loadURI" ) {
        console.log("Loading URL: " + requestMessage.URI);
        chrome.tabs.create({ url: requestMessage.URI}, function(newTab) {
        });    
    };
});



//************************************************
//************************************************
//************************************************
//**** Here are the listeners/relays *************
//**** For posting to tabs/legacy integraiton*****
//************************************************
//************************************************

//Add listener for messages from popup - relay to do the legacy integration
chrome.runtime.onMessage.addListener(function(requestMessage) {
    //We have recieved a message: If it is for posting time, off we go 
    if( requestMessage.action === "preparepost" ) {
        if (requestMessage.timeEntry.legacyPostTime) {
            console.log("Alvis Time: Prepare Post Message For Legacy Integration");
            createTabAndPostLegacyIntegration (requestMessage.timeEntry);
            console.log("Alvis Time: Done with Relaying Message");
        }
    }
});

//Function for opening tab/window to do legacy integration interaction
function createTabAndPostLegacyIntegration (inputTimeEntry) {

    if (saveTab) {
        //Have existing tab - see if it is open
        chrome.tabs.remove(saveTab.id, function() {
            chrome.tabs.create({ url: config.orgLegacyTimeIntegration.legacyIntegrationURI}, function(newTab) {
                saveTab = newTab;
                legacyTabPost (saveTab, inputTimeEntry);
            });    
        });
    }
    else {
        //Not exists
        console.log("Alvis Time: Creating tab");
        chrome.tabs.create({ url: config.orgLegacyTimeIntegration.legacyIntegrationURI}, function(newTab) {
            saveTab = newTab;
            legacyTabPost (saveTab, inputTimeEntry);
        });          
    }

}


//Function for posting to the legacy tab
function legacyTabPost (inputTab, inputTimeEntry) {

    console.log("Alvis Time: Posting = " + inputTimeEntry.description + " - " + inputTimeEntry.descriptionChild);
    chrome.tabs.executeScript(inputTab.id, {file:config.orgLegacyTimeIntegration.legacyIngegrationScript}, function(results) {
        //Success
        console.log("Alvis Time: Script was susccessful");     
    });
}

//************************************************
//************************************************
//************************************************
//**** Here are the listeners/relays *************
//**** For SCREEN SHOT functionallity        *****
//************************************************
//************************************************

//Add listener for messages from popup - relay to do the screenshot integration
chrome.runtime.onMessage.addListener(function(requestMessage) {
    //We have recieved a message: If it is for screenshot, off we go 
    if( requestMessage.action === "screenshot" ) {
        loadWindowForScreenshot (requestMessage.screenshot);
    }
    return true;
});

//Add listener for call from content to take a screenshot
chrome.runtime.onMessage.addListener(function(requestMessage, sender, sendResponse) {
    console.log("Alvis Time: Got a message");
    console.log(requestMessage);
    if (requestMessage.action === "takescreenshot") {
        console.log("Alvis Time: Tells me to take screenshot");

        //Take screenshot of acive tabe and return it
        chrome.tabs.captureVisibleTab(null, {}, function(dataUrl) {
            console.log("Alvis Time: Took image");
            sendResponse({imgSrc:dataUrl});
            console.log("Alvis Time: Sent Image back");

        });
    }
    return true;
});


//Function for opening tab/window to do screenshot
function loadWindowForScreenshot (inputScreenshot) {

    if (saveTab) {
        //Have existing tab - see if it is open
        chrome.tabs.remove(saveTab.id, function() {
            chrome.tabs.create({ url: inputScreenshot.pageToLoad}, function(newTab) {
                saveTab = newTab;
                if (inputScreenshot.takeScreenshot) {
                    loadPageForScreenshot (saveTab, inputScreenshot);
                }
            });  
        });
    }
    else {
        //Not exists
        chrome.tabs.create({ url: inputScreenshot.pageToLoad}, function(newTab) {
            saveTab = newTab;
            if (inputScreenshot.takeScreenshot) {
                loadPageForScreenshot (newTab, inputScreenshot);
            }
        });          
    }

}

//Function for posting to the legacy tab
function loadPageForScreenshot (inputTab, inputScreenshot) {
    //Take screenshot, execute script on page, then message w/image to use in creating eml file
    chrome.tabs.executeScript(inputTab.id, {file:config.orgLegacyTimeIntegration.legacyScreenshotScript}, function(results) {
        //Script executed
        console.log("Alvis Time: Script passed and exected");
    });
}





