/****************
This JS is the main processing set - when DOM loaded, code is fired to get, display, process JIRA time entries
****************/ 
var config;  //object that will hold all configuration options
var workgroup; //easy reference for designated work group
var user;  //easy reference for designated user
var userToRun; //easy refence for who we are running this for

//Going to manage version, just by putting into code
var version = "2020.10.23.1";
var orgKeyLocation = "https://raw.githubusercontent.com/alanhummer/AlvisTimeOrgKeys/master/";
var orgKeyLocationFile = "";

//Setup for the date selection
var range;
var firstDay; //This will hold the first day of our date range - the full date / time of the day
var lastDay; //This will whold the last day of our date range - the full date / time of the day
var offset = 0;
var today = new Date();
var dayOfWeekOffset = today.getDay() + 1;

//User account stuff from self lookup
var orgKey = "";
var blnAdmin = false; //Easy access to admin boolean
var blnViewer = false; //Easy access to view only deignatin
var blnRemoteConfig = true;
var blnPostTimeSet = false; //So we only have post button loaded 1x

//Is the screen interactive, used for toggle
var blnInteractive = true;
var timecardStatus = "entry"; //Keep track of status of the current time card
var blnTimeCardStatusInitialized = false;
var blnPageLoaded = false;
var notice = "";

//Some HTML snippets to use
var issueGroupHTML;
var summaryTable;

//A global way to track, good to validate with
var totalTotal = 0;
var tcIssueCount = 0;
var tcIssueCountTracker = 0;

//An individual issues to query
var lookupIssueKeys = [];
var lookupIssueGroup;
var lookupIssueGroupIndex;

//Hold onto items there were posted or ones we need to clean up
var postedClassficationArray = [];
var worklogCleanupArray = [];

//Hold recent settings
var recentUserName = "";
var recentOffset = "";
var recentPage = "";
var dateTitleHeaderSave = "";

//For report tracking
var reportWorkLogFetchCount = 0;
var reportIssueCount = 0;
var reportObject = {};
var reportIssues = [];
var reportIssueWorklogs = [];

//Show user summaries or not
var blnDoUserTimecardSummaryView = false;
var blnParentLookupDone = false;
var gCountOfParentLookupsSent = 0;
var gCountOfParentLookupsDone = 0;

//Setup for our JIRA Object
var JIRA;

//And so we begin....
document.addEventListener('DOMContentLoaded', onDOMContentLoaded, false);

/****************
Setup and configuration
****************/
function onDOMContentLoaded() {
    
    //See if we have a notifiation to show
    notice = getUrlParameter("notice");
    if (notice.length > 0) {   
        alert(notice); 
        window.close();
    }

    //Initialize the view
    showPageView('welcome-intro');
    
    //And the buttons
    document.getElementById("submit-org-key").addEventListener ("click", function(){ updateOrgKey()}); 
    document.getElementById("setup-new-org").addEventListener ("click", function(){ setupNewOrg()}); 
    document.getElementById("close-image-orgkey").addEventListener ("click", function(){ closeit()}); 
    document.getElementById("help-image-orgkey").addEventListener ("click", function(){ openHelp()}); 
    document.getElementById("close-image-help").addEventListener ("click", function(){ 

        //Setup the view
        showPageView('everything');

        //Save our page laoded
        if (blnAdmin) {
            chrome.storage.local.set({"recentPage": "everything"}, function () {});  
            recentPage = "everything";                
        }
    }); 
    
    document.getElementById("help-image-help").addEventListener ("click", function(){ openHelp()}); 

    //Initialize - grab save user, week, page and load the key and or
    initializeApp();

}

/****************
Load our configuration and kick of the main processing thread on success
****************/
function loadKeyAndOrg() {

    //Initalize this
    config = null;

    //Well, we have started...show any saved date
    if (recentUserName.length > 0 && recentOffset > 0 && recentPage.length > 0) {
        console.log("Alvis Time: Recent USER: " + recentUserName + " OFFSET: " + recentOffset + " PAGE: " + recentPage);
    }    

    chrome.storage.local.get("orgKeya", function(data) {
        if (data) {
            if (data.orgKeya) {
                if (data.orgKeya.length > 0) {
                    if (data == null || typeof data === 'undefined' || data.length <= 0) {
                        //Bogus
                        getNewOrgKey("", "true");
                    }
                    else {
                        //We have an org key, get our configuration and all of the config parameters - data.orgKeya
                        //Get the JSON file and make sure it exists - need to figure out how to laod/host this
                        if (blnRemoteConfig) {

                            var configURL = orgKeyLocation + data.orgKeya + ".json";

                            getConfig("keyLocation", "get", configURL,  function(err, response) {
                
                                if (err != null) {
                                    console.log("Alvis Time: Get config error - ", JSON.parse(JSON.stringify(err)));

                                    //We do not have an org key, get one

                                    switch(err) {
                                        case 503: //Saturday
                                            orgKeyMessage("Could not retrieve organization key at this time. Please check your key and try again or try back later.", "error")
                                            break;
                                        case 404: //Sunday
                                            orgKeyMessage("Could not find this organization key. Please try again.", "error")
                                            break;
                                        case 401: //Monday
                                            orgKeyMessage("You are not authorized to access this key.  Please try again.", "error")
                                            break;
                                        default:
                                    }
                                    getNewOrgKey(data.orgKeya, "true");
                                } 
                                else {
                                    //We ahve successfully gotten the orgkey pointer
                                    if (response.orgKeyURI) {
                                        console.log("Alvis Time: We have an org key location at:" + response.orgKeyURI);
                                        //OK, lets get the Org Key configuraiton from its location
                                        orgKeyLocationFile = response.orgKeyURI;
                                        getConfig("keyStorage", "get", response.orgKeyURI,  function(keyErr, keyResponse) {
                                            //See if it worked
                                            if (keyErr != null) {
                                                //BOGUS - HERE IS WHERE WHERE WE GRAB FROM LOCAL STORAGE
                                                console.log("Alvis Time: Get OrgKeyURI error: ", JSON.parse(JSON.stringify(keyErr)));
                                                orgKeyMessage("We have a valid organization key, but you do not have access to it.  <br><br>Check your network or Jira signin and acces, and try again. Or try a different organization key or contact your administrator.", "error")
                                                getNewOrgKey(data.orgKeya, "true");
                                            }
                                            else {
                                                //All good, lets do this
                                                orgKey = data.orgKeya;
                                                config = keyResponse;

                                                console.log("Alvis Time: Config is: ", JSON.parse(JSON.stringify(config)));

                                                //Compare versions
                                                if (version && config.AlvisTime && config.AlvisTime.version) {

                                                    if (version < config.AlvisTime.version) {

                                                        //Show our version upgrade emssage
                                                        showPageView('version-intro');

                                                        document.getElementById('version-link').innerHTML = document.getElementById('version-link').innerHTML.replace("_VERSION_LINK_", config.AlvisTime.downloadLocation);
                                                        document.getElementById('version-link').innerHTML = document.getElementById('version-link').innerHTML.replace("_VERSION_NUMBER_", config.AlvisTime.version);
                                                        document.getElementById('version-message').innerHTML = document.getElementById('version-message').innerHTML.replace("_VERSION_MESSAGE_", config.AlvisTime.message);
                                                       
                                                        document.getElementById('version-link').addEventListener ("click", function(){ doVersionLink(this)}); 
 
                                                        //Different versions, hwere we go
                                                        if (config.AlvisTime.upgradeRequired) {
                                                            document.getElementById("version-close").addEventListener ("click", function(){ closeit(this)});
                                                        }
                                                        else {
                                                            document.getElementById("version-close").addEventListener ("click", function(){ mainControlThread()});
                                                        }
                                                    }
                                                    else {
                                                        //Get it, so put listner on DOM loaded event
                                                        mainControlThread();                                                    
                                                    }
                                                }
                                                else {
                                                    //Get it, so put listner on DOM loaded event
                                                    mainControlThread();                                                    
                                                }
                                            }                                            
                                        });
                                    }
                                    else {
                                        console.log("Alvis Time: We have gotten an org key location but it FAILS to have orgKeyURI:", JSON.parse(JSON.stringify(response)));
                                        orgKeyMessage("Could not retrieve organization key at this time. Please check your key and try again or try back later.", "error")
                                        getNewOrgKey(data.orgKeya, "true");

                                   }
                                }
                            });
                        }
                        else {
                            console.log("LOADING: " + data.orgKeya + ".json");
                            loadConfig(data.orgKeya + ".json", function(response) { 
                                //See if it was bogus
                                if (response == null || typeof response === 'undefined' || response.length <= 0) {
                                    //Bogus
                                    //We do not have an org key, get one
                                    getNewOrgKey(data.orgKeya, "true");
                                }
                                else {
                                    //Get all of our config parameters
                                    orgKey = data.orgKeya;
                                    config = JSON.parse(response); 
                                    
                                    //Get it, so put listner on DOM loaded event
                                    mainControlThread();
                                }
                            });
                        }
                    }
                }
                else {
                    //We do not have an org key, get one
                    getNewOrgKey("", "false");
                }
            }
            else {
                //We do not have an org key, get one
                getNewOrgKey("", "false");
            }
        }
        else {
            //We do not have an org key, get one
            getNewOrgKey("", "false");
        }
    });

    return true;

}

/****************
CRUD manaagement of the orgKey
****************/
function getNewOrgKey(inputValue, inputErr) {

    //Setup the view
    showPageView('orgkeyrequest');

    document.getElementById('orgkey').value = inputValue;

    if (inputErr == "false") {
        if (inputValue.length > 0) 
            orgKeyMessage("Enter a valid organization key. " + inputValue + " is not valid", "error")
        else
        orgKeyMessage("Enter a valid organization key. It cannot be empty.", "error")
      
    }
}

function updateOrgKey() {
    //Let's make sure it is valid
    if (document.getElementById("orgkey").value.length > 0) {
        if (blnRemoteConfig)  {
            var configURL = orgKeyLocation + document.getElementById("orgkey").value + ".json";
            getConfig("keyLocation", "update", configURL,  function(err, response) {
                if (err != null) {
                    //BogusM
                    orgKeyMessage("Enter a valid organization key. " + document.getElementById("orgkey").value + " is not valid", "error")
                }
                else {
                    if (response == null || typeof response === 'undefined' || response.length <= 0) {
                        //BogusM
                        orgKeyMessage("Enter a valid organization key. " + document.getElementById("orgkey").value + " is not valid", "error")
                    }
                    else {
                        //All good
                        chrome.storage.local.set({"orgKeya": document.getElementById("orgkey").value});
                        window.location.reload(false); 
                        //loadKeyAndOrg();             
                    }
                }
            });
        }
        else {
            loadConfig(document.getElementById("orgkey").value + ".json", function(response) { 
                //See if it was bogus
                if (response == null || typeof response === 'undefined' || response.length <= 0) {
                    //BogusM
                    orgKeyMessage("Enter a valid organization key. " + document.getElementById("orgkey").value + " is not valid", "error")
                }
                else {
                    //All good
                    chrome.storage.local.set({"orgKeya": document.getElementById("orgkey").value});
                    window.location.reload(false); 
                    //loadKeyAndOrg();
                }
            });
        }

    }
    else {
        //org key cannot be empty
        orgKeyMessage("Enter a valid organization key. It cannot be empty.", "error")
    }
}

function setupNewOrg() {
    
    showPageView("orgkeysetup");

}

//For sorting array of objects, this is the compare
function timePriorityCompare(a, b) {
    let comparison = 0;
    if (a.timePriority > b.timePriority) {
        comparison = 1;
    } else if (a.timePriority < b.timePriority) {
        comparison = -1;
    }
    return comparison;
}

//For sorting array of objects by clssification
function classificationCompare(a, b) {
    let comparison = 0;
    if (a.classification > b.classification) {
        comparison = 1;
    } else if (a.classification < b.classification) {
        comparison = -1;
    }
    return comparison;
}

/****************
Showing the time card summary
****************/
function showTimeCardSummary() {

    var classificationArray = [];
    var classificationObject;
    var classificationID = 0;
    var classificationDisplay = "";
    var hoursToOffset = 0;
    var row;

    //Save our page laoded
    if (blnAdmin) {
        chrome.storage.local.set({"recentPage": "timecard-summary"}, function () {});  
        recentPage = "timecard-summary";      
    }

    //If user has priveldge (not input user)
    if (user.legacyScreenShot) {
        if (typeof userToRun.legacyTimeID  === 'undefined') {
            document.getElementById('screenshotlink-summary').style.display =  'none';
            console.log("LEGACY TESTING OFF: " + userToRun.legacyTimeID);
        }
        else {
            document.getElementById('screenshotlink-summary').style.display =  '';
            console.log("LEGACY TESTING ON: " + userToRun.legacyTimeID);
        }
    }
    else {
        document.getElementById('screenshotlink-summary').style.display =  'none';
    }

    //If user has priveldge (not input user)
    if (user.legacyViewCard) {
        if (typeof userToRun.legacyTimeID  === 'undefined') {
            document.getElementById('viewcard-summary').style.display =  'none';
            console.log("LEGACY CARD OFF: " + userToRun.legacyTimeID);
        }
        else {
            document.getElementById('viewcard-summary').style.display =  '';
            console.log("LEGACY CARD ON: " + userToRun.legacyTimeID);
        }
    }
    else {
        document.getElementById('viewcard-summary').style.display =  'none';
    }



    console.log("Alvis Time: Posted array is ");
    console.log(postedClassficationArray);

    //Setup the view
    showPageView('timecard-summary');

    //Load our name
    document.getElementById('timecard-summary-name').innerHTML = userToRun.name;

    //Load our date header
    document.getElementById('timecard-summary-range').innerHTML = range.innerHTML;

    //Clear out our table
    document.getElementById('timecard-summary-wrapper').innerHTML = summaryTable;

    //Setup totals object
    var classificationTotalsObject = {
        "id": 0,
        "description": "TOTALS:",
        "descriptionChild": "TOTALS:",
        "dayTotal": [0, 0, 0, 0, 0, 0, 0],
        "totalTotal": 0
    }

    //For each issue, if > 0 hours, add hours for each day to classificationObject set for each day - incl total
    workgroup.issueGroups.forEach(function(issueGroup) {

        issueGroup.issues.forEach(function(issue) {
            if (issue.issueTotalTime > 0) {
    
                //Our classification display
                classificationDisplay = "";

                var classificationObject;
                //See if we cna find our classification already
                classificationArray.forEach(function(classObj) {
                    if (classObj.description == issue.classification && classObj.descriptionChild == issue.classificationChild) {
                        //Found one - done
                        classificationObject = classObj;
                    }
                }) 

                //If not, create one
                if (!classificationObject) {

                    //A key for the classifications
                    classificationID = classificationID + 1;

                    classificationObject = {
                        "id": classificationID,
                        "userId": userToRun.userid,
                        "legacyPostTime": false, //What is this?
                        "weekOf": ISODate(firstDay),
                        "description": issue.classification,
                        "descriptionChild": issue.classificationChild,
                        "dayTotal": [0, 0, 0, 0, 0, 0, 0],
                        "totalTotal": 0,
                        "dayPostedTotal": [0, 0, 0, 0, 0, 0, 0], //For offset hours
                        "postedTotal": 0, //For offset hours
                        "timePriority": issueGroup.timePriority //Initially, match issueGroup time priority.  May have addtl definitions by project at some point - thos would go here
                    }

                    console.log("OFFSET SETTING CLASS OBJECT:" + classificationObject.description + " PRIORITY: " + classificationObject.timePriority);
                    
                    //Now add the object to the array
                    classificationArray.push(classificationObject);

                }

                //For each day, add the amounts to the totals for the classification
                for (var dayIndex=0; dayIndex < 7; dayIndex++) {
                    if (issue.worklogDisplayObjects[dayIndex].worklogTimeSpent > 0) {
                        classificationObject.dayTotal[dayIndex] =  classificationObject.dayTotal[dayIndex] + issue.worklogDisplayObjects[dayIndex].worklogTimeSpent;
                        classificationTotalsObject.dayTotal[dayIndex] =  classificationTotalsObject.dayTotal[dayIndex] + issue.worklogDisplayObjects[dayIndex].worklogTimeSpent;
                    }
                }

                //For double checking totals
                classificationObject.totalTotal = classificationObject.totalTotal + issue.issueTotalTime;
                classificationTotalsObject.totalTotal = classificationTotalsObject.totalTotal + issue.issueTotalTime;

            }
        })

    })

    //Setup starter object
    var prevClassificationObject = {
        "id": 0,
        "description": "(not defined)",
        "descriptionChild": "(not defined)",
        "dayTotal": [0, 0, 0, 0, 0, 0, 0],
        "totalTotal": 0,
        "timePriority": 0
    }

    //Setup our offset totals object
    var classificationTotalsOffsetObject = {
        "id": -1,
        "description": "OFFSET:",
        "descriptionChild": "OFFSET:",
        "dayTotal": [0, 0, 0, 0, 0, 0, 0],
        "totalTotal": 0,
        "timePriority": 0
    }
    
    //Make a copy of our totals for use in offset methods
    var classificationTotalsNetObject = {
        "id": -1,
        "description": "NET TOTALS:",
        "descriptionChild": "NET TOTALS:",
        "dayTotal": [classificationTotalsObject.dayTotal[0], classificationTotalsObject.dayTotal[1], classificationTotalsObject.dayTotal[2], classificationTotalsObject.dayTotal[3], classificationTotalsObject.dayTotal[4], classificationTotalsObject.dayTotal[5], classificationTotalsObject.dayTotal[6]],
        "totalTotal": classificationTotalsObject.totalTotal
    }

    //Let's sort our array of classification objects by timePriority
    classificationArray = classificationArray.sort(timePriorityCompare);

    //Set our hours to offset
    //if (classificationTotalsObject.totalTotal > userToRun.maxHoursToSubmit) {
        hoursToOffset = classificationTotalsObject.totalTotal - userToRun.maxHoursToSubmit;
        //Fill in our time to the "posted time" by priority untill we run out (ie: 40)
        //do time priority 1 first, dish out posted time to those items, then 2, then 3...keep going til reach max hours mark
        hoursToDrawDown = userToRun.maxHoursToSubmit;
        classificationArray.forEach(function(classificationObject) {
            for (var dayIndex=0; dayIndex < 7; dayIndex++) {
                if (hoursToDrawDown >=  classificationObject.dayTotal[dayIndex]) {
                    classificationObject.dayPostedTotal[dayIndex] = classificationObject.dayTotal[dayIndex];
                }
                else {
                    classificationObject.dayPostedTotal[dayIndex] = hoursToDrawDown;                   
                }
                classificationObject.postedTotal = classificationObject.postedTotal + classificationObject.dayPostedTotal[dayIndex]
                hoursToDrawDown = hoursToDrawDown - classificationObject.dayPostedTotal[dayIndex];
            }
            //console.log("CLASSIFICATION OBJECT SORTED DRAW DOWN:", JSON.parse(JSON.stringify(classificationObject)));
        });
   // }

    //For each classification object, if hours > 0 show it to the grid AND we set posted time based on priority, show it here as second line
    classificationArray.forEach(function(classificationObject) {

            console.log("OFFSET: Hours to offset = " + hoursToOffset + " CLASSIFICIATON IS: " + classificationObject.description + " PRIORITY IS: " + classificationObject.timePriority);

            if (classificationObject.description == prevClassificationObject.description) {
                //Same main class, don't show the main class name
            }
            else {
                //filler - if not the first one
                if (prevClassificationObject.description != "(not defined)") {

                    //New main class, so start fresh and show the class name - filller first
                    row = generateTimecardSummaryRow(classificationObject, "timecard-summary-class", "fill", "", "3");

                    //And add it to our issue group table
                    document.getElementById("timecard-summary-details").appendChild(row);   
  
                    //New main class, so start fresh and show the class name - filller first
                    row = generateTimecardSummaryRow(classificationObject, "timecard-summary-class", "fill", "#99b3ff;", "1");

                    //And add it to our issue group table
                    document.getElementById("timecard-summary-details").appendChild(row);   

                }

                //New main class, so start fresh and show the class name
                row = generateTimecardSummaryRow(classificationObject, "timecard-summary-class", "head");

                //And add it to our issue group table
                document.getElementById("timecard-summary-details").appendChild(row);   

            }

            //Now have to dcreate the row now
            row = generateTimecardSummaryRow(classificationObject, "timecard-summary-class", "detail");

            //And add it to our issue group table
            document.getElementById("timecard-summary-details").appendChild(row);   

            //If admin, dd listener to checkbox
            if (user.legacyPostTime && classificationObject.description != "No classification defined") {
                document.getElementById(classificationObject.id + "+posttime").addEventListener ("click", function(){ doClassificationPostTime(this, classificationObject)}); 
            }
            else {
                document.getElementById("postheader").style.display = 'none';
            }    
        
            //Here is where the adjustment row goes
            //So, see if total hours sumbitted - adjusted hours is great than our max - if so, keep ofsetting
            if (classificationObject.postedTotal < classificationObject.totalTotal) {

                //Doing an offset, build an offset object
                offsetObject = {
                    "id": 0,
                    "description": "Offset",
                    "descriptionChild": "Offset",
                    "dayTotal": [0, 0, 0, 0, 0, 0, 0],
                    "totalTotal": 0,
                    "timePriority": classificationObject.timePriority //Initially, match issueGroup time priority.  May have addtl definitions by project at some point - thos would go here
                }

                //Now do an offset

                //For each day, add the amounts to the totals for the classification
                for (var dayIndex=0; dayIndex < 7; dayIndex++) {
                    console.log("OFFSET: TOTALS FOR " + classificationTotalsObject.description + " DAY: " + dayIndex + " IS " + classificationTotalsObject.dayTotal[dayIndex] + " VS " + workgroup.settings.dayHoursMax);
                    offsetObject.dayTotal[dayIndex] = classificationObject.dayTotal[dayIndex] - classificationObject.dayPostedTotal[dayIndex];
                    offsetObject.totalTotal = offsetObject.totalTotal + offsetObject.dayTotal[dayIndex];

                    //Fill in our offset totals object
                    classificationTotalsOffsetObject.dayTotal[dayIndex] = classificationTotalsOffsetObject.dayTotal[dayIndex] + offsetObject.dayTotal[dayIndex];
                    classificationTotalsOffsetObject.totalTotal = classificationTotalsOffsetObject.totalTotal + offsetObject.dayTotal[dayIndex];                 
                    
                    //Fill in our offset net object
                    classificationTotalsNetObject.dayTotal[dayIndex] = classificationTotalsNetObject.dayTotal[dayIndex] - offsetObject.dayTotal[dayIndex];
                    classificationTotalsNetObject.totalTotal = classificationTotalsNetObject.totalTotal - offsetObject.dayTotal[dayIndex];

               }

                console.log("OFFSET: DONE.  Now we have hours to offset = " + hoursToOffset, JSON.parse(JSON.stringify(classificationTotalsObject)));

                //Now have to create the offset row
                row = generateTimecardSummaryRow(offsetObject, "timecard-summary-class", "offset");

                //And add it to our issue group table
                document.getElementById("timecard-summary-details").appendChild(row);  

            }

            //Reset our previous object
            prevClassificationObject = classificationObject;

    })

    //Final fill buffer
    row = generateTimecardSummaryRow(classificationTotalsObject, "timecard-summary-class", "fill", "#99b3ff;", "3");

    //And add it to our issue group table
    document.getElementById("timecard-summary-details").appendChild(row);   

    //And the totals
    row = generateTimecardSummaryRow(classificationTotalsObject, "timecard-summary-totals", "total");

    //And add it to our issue group table
    document.getElementById("timecard-summary-details").appendChild(row);   

    //And the offset totals
    row = generateTimecardSummaryRow(classificationTotalsOffsetObject, "timecard-summary-totals", "offset-total");

    //And add it to our issue group table
    document.getElementById("timecard-summary-details").appendChild(row);   

    //And the net
    row = generateTimecardSummaryRow(classificationTotalsNetObject, "timecard-summary-totals-net", "total");

    //And add it to our issue group table
    document.getElementById("timecard-summary-details").appendChild(row);   

}


/****************
Show Report
****************/
function showReport(inputReportObject) {

    console.log("DOING TEAM REPORT - ", JSON.parse(JSON.stringify(inputReportObject)));

    //Hold our counts of asyn callbacks
    gCountOfParentLookupsSent = 0;
    gCountOfParentLookupsDone = 0;

    //Create our rows
    inputReportObject.issues.forEach(function (issue) {

        //Build our list of project/sub projects
        setIssueClassification(issue, inputReportObject);

        //Clea up any unset classifiations
        if (!issue.classification) {
            issue.classification = "";
        }

    });

    console.log("TESTING ON PARENT LOOKUPS: " + gCountOfParentLookupsSent + " VS " + gCountOfParentLookupsDone);
   
    if (gCountOfParentLookupsSent > gCountOfParentLookupsDone) {
        console.log("DID WAIT ON PARENT LOOKUPS: " + gCountOfParentLookupsSent + " VS " + gCountOfParentLookupsDone);
        setTimeout(function () { showReportLines(inputReportObject); }, 3000);
    }
    else {
        //let's do this
        console.log("SKIPPED WAIT ON PARENT LOOKUPS: " + gCountOfParentLookupsSent + " VS " + gCountOfParentLookupsDone);
        showReportLines(inputReportObject);

    }

    
}

/****************
Show Report Lines
****************/
function showReportLines(inputReportObject) {

    //Here we go: reportObject --> issues --> worklogs
    var myOutputRow = "";
    var myOutputRows = "";
    var dayIndex;
    var dayOfWeek = [0, 0, 0, 0, 0, 0, 0];
    var dayOfWeekClassification = [0, 0, 0, 0, 0, 0, 0];
    var totalWeek = [0, 0, 0, 0, 0, 0, 0];
    var weekTotal = 0;
    var weekTotalClassification = 0;
    var totalWeekTotal = 0;
    var saveClassification = "";
    var saveShade = "report-shade-1";

    console.log("PARENT PROCESSED SO WE ARE DOING REPORT");

    //Add report header
    document.getElementById('report-name').innerHTML = responseObject.issue.report.name + " - " + ISODate(firstDay);

    inputReportObject.issues = inputReportObject.issues.sort(classificationCompare);

    //Create our rows
    inputReportObject.issues.forEach(function (issue) {

        //Go thru the worklogs and add em up
        issue.worklogs.forEach(function(worklog) {

            //Now lets process our worklog - filter date range and user id from comments
            var worklogDate = new Date(worklog.started);

            //Now convert to CT for compare
            if (worklogDate.getTimezoneOffset() == 300) {
                //Central time - leave it
            }
            else {
                //Diff time zone - convert for comparison
                worklogDate = convertToCentralTime(worklogDate);
            }

            //Added em up to right day counts
            switch(worklogDate.getDay()) {
                case 6: //Saturday
                    dayIndex = 0
                    break;
                case 0: //Sunday
                    dayIndex = 1;
                    break;
                case 1: //Monday
                    dayIndex = 2;
                    break;
                case 2: //Tuesday
                    dayIndex = 3;
                    break;
                case 3: //Wednesday
                    dayIndex = 4;
                    break;
                case 4: //Thursday
                    dayIndex = 5;
                    break;
                case 5: //Friday
                    dayIndex = 6;
                    break;
                default:
            }

            //Add to the right day
            dayOfWeek[dayIndex] = dayOfWeek[dayIndex] +  (worklog.timeSpentSeconds / 3600);
            weekTotal = weekTotal + (worklog.timeSpentSeconds / 3600);

            //Add to the right day for totals
            totalWeek[dayIndex] = totalWeek[dayIndex] +  (worklog.timeSpentSeconds / 3600);
            totalWeekTotal = totalWeekTotal + (worklog.timeSpentSeconds / 3600);

        });

        if (issue.classification != saveClassification) {

            if (saveClassification != "") {
                //Show the prior totals

                //Classification Row - total from prior
                myOutputRow = document.getElementById('report-total').innerHTML;
                myOutputRow = myOutputRow.replace(/report-summary/gi, "report-title"); 
                myOutputRow = myOutputRow.replace(/report-shade-entry/gi, saveShade); 
                myOutputRow = myOutputRow.replace(/_REPORTISSUE_/gi, "TOTAL:"); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY0_/gi, dayOfWeekClassification[0]); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY1_/gi, dayOfWeekClassification[1]); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY2_/gi, dayOfWeekClassification[2]); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY3_/gi, dayOfWeekClassification[3]); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY4_/gi, dayOfWeekClassification[4]); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY5_/gi, dayOfWeekClassification[5]); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY6_/gi, dayOfWeekClassification[6]); 
                myOutputRow = myOutputRow.replace(/_REPORTWEEKTOTAL_/gi, weekTotalClassification); 
                myOutputRow = myOutputRow.replace(/_REPORTTOTALTOTAL_/gi, "-"); 
                myOutputRow = myOutputRow.replace(/_REPORTESTIMATE_/gi, "-"); 
                myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, "-"); 

                //Add it to the rest
                myOutputRows = myOutputRows + myOutputRow;

                if (saveShade == "report-shade-1") {
                    saveShade = "report-shade-2";
                }
                else {
                    saveShade = "report-shade-1";              
                }
            }

            //Show off new classifcation and save it
            saveClassification = issue.classification;

            //Initialize class counters
            dayOfWeekClassification = [0, 0, 0, 0, 0, 0, 0];
            weekTotalClassification = 0;

            //Classification Row
            myOutputRow = document.getElementById('report-header-row').innerHTML;
            myOutputRow = myOutputRow.replace(/report-summary/gi, "report-title"); 
            myOutputRow = myOutputRow.replace(/report-shade-entry/gi, saveShade); 
            myOutputRow = myOutputRow.replace(/_REPORTISSUE_/gi, saveClassification.toUpperCase()); 


            //Add it to the rest
            myOutputRows = myOutputRows + myOutputRow;

        }

        console.log("OK - PEEK AT ISSUE: ", JSON.parse(JSON.stringify(issue)));

        //We switched classificaiton and reset, so now add new amount in
        for(var u=0;u<dayOfWeekClassification.length;u++) {
            dayOfWeekClassification[u] = dayOfWeekClassification[u] + dayOfWeek[u];
        }
        weekTotalClassification = weekTotalClassification + weekTotal;
        
        //Build our row
        myOutputRow = document.getElementById('report-row').innerHTML;
        myOutputRow = myOutputRow.replace(/report-shade-entry/gi, saveShade); 

        myOutputRow = myOutputRow.replace(/_REPORTISSUE_/gi, issue.key + " - " + titleCase(issue.fields.summary)); 
        
        var myLink = config.orgJiraBaseURI + "/browse/" + issue.key;
        myOutputRow = myOutputRow.replace(/_ISSUELINK_/gi, myLink); 

        myOutputRow = myOutputRow.replace(/_REPORTISSUEKEY_/gi, issue.key);         
        myOutputRow = myOutputRow.replace(/_REPORTDAY0_/gi, dayOfWeek[0]); 
        myOutputRow = myOutputRow.replace(/_REPORTDAY1_/gi, dayOfWeek[1]); 
        myOutputRow = myOutputRow.replace(/_REPORTDAY2_/gi, dayOfWeek[2]); 
        myOutputRow = myOutputRow.replace(/_REPORTDAY3_/gi, dayOfWeek[3]); 
        myOutputRow = myOutputRow.replace(/_REPORTDAY4_/gi, dayOfWeek[4]); 
        myOutputRow = myOutputRow.replace(/_REPORTDAY5_/gi, dayOfWeek[5]); 
        myOutputRow = myOutputRow.replace(/_REPORTDAY6_/gi, dayOfWeek[6]); 
        myOutputRow = myOutputRow.replace(/_REPORTWEEKTOTAL_/gi, weekTotal); 
        
        //Fill in estimate presentations
        if (issue.fields.timeoriginalestimate) {
            if (issue.fields.timeoriginalestimate == 0 && issue.fields.timeestimate == 0) {
                myOutputRow = myOutputRow.replace(/_REPORTESTIMATE_/gi, "-"); 
                myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, "-");  
            }
            else {
                myOutputRow = myOutputRow.replace(/_REPORTESTIMATE_/gi, issue.fields.timeoriginalestimate/3600); 
                myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, issue.fields.timeestimate/3600); 

                //Red if over, else leave it be
                if (issue.fields.timespent > issue.fields.timeoriginalestimate) {
    
                    myOutputRow = myOutputRow.replace(/report-total-black-red-line/gi, "report-total-red-line"); 
                }
            }
        }
        else {
            myOutputRow = myOutputRow.replace(/_REPORTESTIMATE_/gi, "-"); 
            if (issue.fields.timeestimate == 0) {
                myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, "-");  
            }
            else {
                myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, issue.fields.timeestimate/3600); 
            }

        }
        //If not already red, replace this
        myOutputRow = myOutputRow.replace(/report-total-black-red-line/gi, "report-total-line"); 
        myOutputRow = myOutputRow.replace(/_REPORTTOTALTOTAL_/gi, issue.fields.timespent/3600);        


        //Add it to the rest
        myOutputRows = myOutputRows + myOutputRow;

        dayOfWeek = [0, 0, 0, 0, 0, 0, 0];
        weekTotal = 0;
   
    });

    //Final classification total
    myOutputRow = document.getElementById('report-total').innerHTML;
    myOutputRow = myOutputRow.replace(/report-summary/gi, "report-title"); 
    myOutputRow = myOutputRow.replace(/report-shade-entry/gi, saveShade); 
    myOutputRow = myOutputRow.replace(/_REPORTISSUE_/gi, "TOTAL:"); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY0_/gi, dayOfWeekClassification[0]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY1_/gi, dayOfWeekClassification[1]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY2_/gi, dayOfWeekClassification[2]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY3_/gi, dayOfWeekClassification[3]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY4_/gi, dayOfWeekClassification[4]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY5_/gi, dayOfWeekClassification[5]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY6_/gi, dayOfWeekClassification[6]); 
    myOutputRow = myOutputRow.replace(/_REPORTWEEKTOTAL_/gi, weekTotalClassification); 
    myOutputRow = myOutputRow.replace(/_REPORTTOTALTOTAL_/gi, "-"); 
    myOutputRow = myOutputRow.replace(/_REPORTESTIMATE_/gi, "-"); 
    myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, "-"); 

    //Add it to the rest
    myOutputRows = myOutputRows + myOutputRow;

    //And finally our TOTAL total row
    if (saveShade == "report-shade-1") {
        saveShade = "report-shade-2";
    }
    else {
        saveShade = "report-shade-1";              
    }

    myOutputRow = document.getElementById('report-total').innerHTML;
    myOutputRow = myOutputRow.replace(/report-summary/gi, "report-title"); 
    myOutputRow = myOutputRow.replace(/report-shade-entry/gi, saveShade); 
    myOutputRow = myOutputRow.replace(/_REPORTISSUE_/gi, "TOTALS FOR THE WEEK:"); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY0_/gi, totalWeek[0]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY1_/gi, totalWeek[1]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY2_/gi, totalWeek[2]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY3_/gi, totalWeek[3]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY4_/gi, totalWeek[4]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY5_/gi, totalWeek[5]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY6_/gi, totalWeek[6]); 
    myOutputRow = myOutputRow.replace(/_REPORTWEEKTOTAL_/gi, totalWeekTotal); 
    myOutputRow = myOutputRow.replace(/_REPORTTOTALTOTAL_/gi, "-"); 
    myOutputRow = myOutputRow.replace(/_REPORTESTIMATE_/gi, "-"); 
    myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, "-"); 

    //Add it to the rest
    myOutputRows = myOutputRows + myOutputRow;

    console.log("AJH OOUTPUT ROW: " + myOutputRows); 

    document.getElementById('report-display').innerHTML = myOutputRows;

    //Create our rows
    inputReportObject.issues.forEach(function (issue) {

        //And add our listerners
        document.getElementById("Report-Link-" + issue.key).addEventListener ("click", function(){ jiraIssuelink(config.orgJiraBaseURI + "/browse/" + issue.key) }); 

    });

     //Setup the view
    showPageView('report');

        
    //All done
    togglePageBusy(false);


}

/****************
Main control thread - When document loaded, do this routine
****************/
function mainControlThread() { // BUG: If > 1 time thru (change dorgs) then these initializations cant happen again

    //And make the page inactive
    togglePageBusy(true);

    //Log where we are at
    console.log("Alvis Time: API Endpoint: " + config.orgJiraBaseURI + config.orgJiraAPIExtension);

    //Setup our JIRA object
    JIRA = JiraAPI(config.orgJiraBaseURI, config.orgJiraAPIExtension, "");

    //Set up UI Element for Close Button
    document.getElementById('closeLink').href = "nowhere";
    document.getElementById('closeLink').onclick = closeit;
   
    //Set up UI Element for Help Button
    document.getElementById('helpLink').href = "nowhere";
    document.getElementById('helpLink').onclick = openHelp;
  
    //Set up UI Element for Close Button on Org Key
    document.getElementById('closeLink-orgkey').href = "nowhere";
    document.getElementById('closeLink-orgkey').onclick = closeit;

    //Set up UI Element for Help Button
    document.getElementById('helpLink-orgkey').href = "nowhere";
    document.getElementById('helpLink-orgkey').onclick = openHelp;


    //Set up UI Element for Previous and next buttons
    document.getElementById('previousWeek').href = "nowhere";
    document.getElementById('previousWeek').onclick = previousWeek;
    document.getElementById('nextWeek').href = "nowhere";
    document.getElementById('nextWeek').onclick = nextWeek;  

    //Workflow button - anchor, image, div - different ways to do this..here I'll drive div w/eventlistener
    document.getElementById("submit-image").addEventListener ("click", function(){ updateWorklogStatuses('submit')}); 
    document.getElementById("reject-button").addEventListener ("click", function(){ updateWorklogStatuses('reject')}); 

    //Change org button - anchor, image, div - different ways to do this..here I'll drive div w/eventlistener
    document.getElementById("change-org-image").addEventListener ("click", function(){ getNewOrgKey(orgKey, false)}); 

    //Show time card summary button - anchor, image, div - different ways to do this..here I'll drive div w/eventlistener
    document.getElementById("summary-image").addEventListener ("click", function(){ showTimeCardSummary()}); 
    document.getElementById("close-image-summary").addEventListener ("click", function(){ 
        //Setup the view
        showPageView('everything');

        //Save our page laoded
        if (blnAdmin) {
            chrome.storage.local.set({"recentPage": "everything"}, function () {});  
            recentPage = "everything";                
        }
    }); 

    //Show time card summary button - anchor, image, div - different ways to do this..here I'll drive div w/eventlistener
    document.getElementById("close-image-help").addEventListener ("click", function(){ 
        //Setup the view
        showPageView('everything');

        //Save our page laoded
        if (blnAdmin) {
            chrome.storage.local.set({"recentPage": "everything"}, function () {});  
            recentPage = "everything";                
        }
    });   

    //Wire up report buttons
    document.getElementById("close-image-report").addEventListener ("click", function(){ 
        //Setup the view
        showPageView('everything');

        //Save our page laoded
        if (blnAdmin) {
            chrome.storage.local.set({"recentPage": "everything"}, function () {});  
            recentPage = "everything";                
        }
    }); 

    //Show time card summary button - anchor, image, div - different ways to do this..here I'll drive div w/eventlistener
    //Set up UI Element for Help Button
    document.getElementById('helpLink-report').href = "nowhere";
    document.getElementById('helpLink-report').onclick = openHelp;


    //Set up UI Element for Help Button
    document.getElementById('helpLink-summary').href = "nowhere";
    document.getElementById('helpLink-summary').onclick = openHelp;
    

    //Set up UI Element for Screenshot Button
    //document.getElementById('screenshotlink-summary').href = "nowhere";
    //document.getElementById('screenshotlink-summary').onclick = legacyView;    
    document.getElementById("screenshot-image-summary").addEventListener ("click", function(){ legacyView(true)}); 


    //Set up UI Element for timecard view Button
    //document.getElementById('viewcard-summary').href = "nowhere";
    //document.getElementById('viewcard-summary').onclick = legacyView;    
    document.getElementById("viewcard-image-summary").addEventListener ("click", function(){ legacyView(false)}); 

    //Grab our HTML blocks
    issueGroupHTML = document.getElementById('all-issue-groups-container').innerHTML;
    document.getElementById('all-issue-groups-container').innerHTML = "";

    //And for summary table
    summaryTable = document.getElementById('timecard-summary-wrapper').innerHTML;
    document.getElementById('timecard-summary-wrapper').innerHTML = "";

    //Get User info
    JIRA.getUser()
        .then(onUserSuccess, onUserError);

}

/****************
Fetch for user was Successful -
****************/
function onUserSuccess(response) {

    var retrievedUserId = "";

    //Report out we have a user
    if (response.accountId) {
        retrievedUserId = response.accountId;
    }
    else {
        if (response.name) {
            retrievedUserId = response.name;
        }
        else {
            if (response.key) {
                retrievedUserId = response.key;  
            }
        }
    }

    var userOptions;  //This will hold the selection list of users to chane between, if we are an admin

    //This contains multipe workgroups, figure out which one the user is in
    for (var w=0;w<config.workgroups.length;w++) {
        for(var u=0;u<config.workgroups[w].users.length;u++) {
            
            //Set our internal valules
            config.workgroups[w].users[u].timecardHours = 0;
            config.workgroups[w].users[u].timecardStatusColor = 'black';

            //See if we found our user account    
            if (config.workgroups[w].users[u].userid == retrievedUserId) {
                //We have a user match - what to do if in multiple work groups?
                if (typeof workgroup === 'undefined') {
                    workgroup = config.workgroups[w];
                    //What to do if user exist more than once?
                    if (typeof user === 'undefined') {

                        //Found our user, initialize any defaults
                        user = workgroup.users[u];
                        userDefaults(user);

                        //Now save what user running this for, in case we switch
                        userToRun = user;

                    }
                    else {
                        //Poblem - user is duplicated in config
                        console.log("Alvis Time: What to do? You are as multiple accounts: " + workgroup.name + ":" + user.name + " and " + config.workgroups[w].name + ":" + config.workgroups[w].users[u].name + " Keeping: " + workgroup.name + ":" + user.name);
                    }
                }
                else {
                    //Poblem - user in more than 1 workgroup
                    console.log("Alvis Time: What to do? You are in multiple work groups: " + workgroup.name + ":" + user.name + " and " + config.workgroups[w].name + "." + config.workgroups[w].users[u].name + " Keeping: " + workgroup.name + ":" + user.name);
                }
            }
        }
    }

    //If user does not have access, let them off EZ
    if (typeof workgroup === 'undefined' || typeof user === 'undefined') {
        //sorry charlie
        alert("Sorry, you aren't set up for this app");
        getNewOrgKey("", false);
        return;
        //closeit();
    }        

    console.log("Alvis Time: User:" + user.name + " - " + user.userid + " - " + user.email);

    if (workgroup.settings.emailOnLogin.doSend) {
        sendEmail(workgroup.settings.emailOnLogin.subject, workgroup.settings.emailOnLogin.message, workgroup.settings.emailOnLogin.from, workgroup.settings.emailOnLogin.to);
    }

    //If interested in version management, use this
    getVersion();

    //Setup the view
    showPageView('everything');

    // Set week date range header in html
    range = document.getElementById('week-dates-description');

    //See if we are admin 
    if (user.role == "admin"|| user.role == "viewer") {
        if (user.role == "admin")
            blnAdmin = true;
        else 
            blnViewer = true;

        if (blnAdmin)
            document.getElementById('orgkeylocationfile').innerHTML =  orgKeyLocationFile;

        //Admins get recent week
        if (blnAdmin)
            getWeek(recentOffset);
        else
            getWeek();

        console.log("Alvis Time: You are admin");
    
        if (blnAdmin) {
            if (recentUserName.length > 0) {
                console.log("Alvis Time: Looking for recent user " + recentUserName);
                //Change user if we saved one
                for (var i=0;i<workgroup.users.length;i++) {
                    if (workgroup.users[i].name == recentUserName) {
                        console.log("Alvis Time: Loaded recent user " + recentUserName);
                        userToRun = workgroup.users[i];
                        userDefaults(userToRun);
                        }
                }
            }
        }

        //Grab the time entered for each user in the workgroup
        loadWorkgroupTimeCards();
        
    }
    else {
        getWeek();
    } 

    //Save our date title header stuff for future use
    dateTitleHeaderSave = document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML;

    //Put the dates in the columns
    updateDateHeaders();

    //And logo
    document.getElementById('logoimage').src = config.orgLogo;        

    //Close link
    document.getElementById("closeLink").innerHTML = document.getElementById("closeLink").innerHTML.replace(/_CLOSE_/gi, workgroup.titles.close);

    //Our user timecard summary view       
    if (blnAdmin || blnViewer) {

        if (blnAdmin) {
            //Wire up the summary info button - the button that shows submitted hours
            document.getElementById("summary-info-image").addEventListener ("click", function(){ 

                //Toggle the button an value
                toggleSummaryButton();

                //Reload the list of folks and times
                loadWorkgroupTimeCards();

            }); 
        }
        else {
            document.getElementById("summary-info-image").remove();
        }

        //Wire up the reprt info button
        document.getElementById("report-image").addEventListener ("click", function(){ 

            //Toggle the button an value
            generateTeamReport("teamTotal");

        }); 

    }
    else {
        document.getElementById("report-image").remove();
    }



    //Grab our stored classification posts, if we have them
    if (blnAdmin) {
        chrome.storage.local.get("postedArray", function(data) {
            if (data) {
                if (data["postedArray"]) {
                    postedClassficationArray = data["postedArray"];
                }
            }
            //Get the issues and show them off
            processIssueGroups("intro");

        });
    }
    else {
        //Get the issues and show them off
        processIssueGroups("intro");
    }

    if (!blnAdmin && !blnViewer) 
        document.getElementById("user-select").innerHTML = "<div class='user-name-display'>&nbsp; " + workgroup.titles.welcome + " " + user.name + " - " + workgroup.name + "</div>";

}

/****************
Fetch for Version
****************/    
function getVersion() {

    //We have user, orgkey, config, etc.  Store version and send notice if it is new
    chrome.storage.local.get("alvisTimeVersion", function(data) {
        var blnNewVersion = false;
        if (data) {
            if (data.alvisTimeVersion) {
                if (data.alvisTimeVersion.length > 0) {
                    if (data == null || typeof data === 'undefined' || data.length <= 0) {
                        //New version updated
                        blnNewVersion = true;
                    }
                    else {
                        //Get a version, see if matches
                        if (data.alvisTimeVersion == version) {
                            //All good, same version
                        }
                        else {
                            //New version updated
                            blnNewVersion = true;
                        }
                    }
                }
                else {
                    //New version updated
                    blnNewVersion = true;                   
                }
            }
            else {
                //New version updated
                blnNewVersion = true;                   
            }
        }
        else {
            //New version updated
            blnNewVersion = true;         
        }
 
        //If new version, store it and send notice
        if (blnNewVersion) {
            chrome.storage.local.set({"alvisTimeVersion": version}, function () {}); 
            console.log("Alvis Time: New Version - " + version);
            //Let's send out a notice. 
            if (workgroup.settings.emailOnUpgrade.doSend) {
                var myMessage = workgroup.settings.emailOnUpgrade.message;
                myMessage = myMessage.replace("_OLDVERSION_", data.alvisTimeVersion);
                myMessage = myMessage.replace("_NEWVERSION_", version);
                var mySubject = workgroup.settings.emailOnUpgrade.message;
                mySubject = mySubject.replace("_OLDVERSION_", data.alvisTimeVersion);
                mySubject = mySubject.replace("_NEWVERSION_", version);
                sendEmail(mySubject, myMessage, workgroup.settings.emailOnUpgrade.from, workgroup.settings.emailOnUpgrade.to);
            }
        }
    });
}


/****************
Fetch for user failed -
****************/    
function onUserError(error) {
    console.log("Alvis Time: Failed to get user:");
    console.log(error);
    
    //Enable the page
    togglePageBusy(false);
    
    //Put it to you window instead
    if (error.status == 401) {
        alert("You are not logged into Jira.  Please login to resolve");
        notificationMessage("You are not logged into Jira.  Please login to resolve: <br><br><br><a target='_new' href='" + config.orgJiraBaseURI + "'>" + config.orgJiraBaseURI + "</a>", "error");
        openLink(config.orgJiraBaseURI);
        closeit();
        //Load JIR URL!
    }
    else if (error.statusText == 'Unknown Error') {
        alert("You are not on the network.  Please connect to the network and try again.");
        notificationMessage("A network error occurred.  You must be on the network and have access to Jira at: <br><br><br><a target='_new' href='" + config.orgJiraBaseURI + "'>" + config.orgJiraBaseURI + "</a>", "error");
        closeit();
    }
    else {
        //orgKeyMessage("Enter a valid organization key. " + inputValue + " is not valid", "error")
        genericResponseError(error);
    }
        

}

/****************
Change which user we are -
****************/    
function changeuser(inputUsername) {

    for (var i=0;i<workgroup.users.length;i++) {
        if (workgroup.users[i].name == inputUsername) {
            userToRun = workgroup.users[i];
            userDefaults(userToRun);

            document.getElementById("user-selection").style.background = userToRun.timecardStatusColor;
        }
    }
    console.log("Alvis Time: Changed to " + userToRun.name + " + " + userToRun.userid + " + " + userToRun.email);

    //Set our storage for user and continue on
    chrome.storage.local.set({"recentUserName": userToRun.name}, function () {});
    
    //Grab our stored classification posts, if we have them
    if (blnAdmin) {
        postedClassficationArray = [];
        chrome.storage.local.remove("postedArray", function() {
            //Get the issues - need to reset everything since we changed user
            processIssueGroups("userchange");
        });
    }
    else {
        //Get the issues - need to reset everything since we changed user
        processIssueGroups("userchange");
    }
    

}

/****************
This does all the calling - restarts everything up
****************/       
function processIssueGroups(inputMessageType) {

    //Disable the page
    togglePageBusy(true);

    //Setup intro message
    if (inputMessageType != "addedissue" && inputMessageType != "previousweek" && inputMessageType != "nextweek") {
        notificationMessage(workgroup.messages.intro, "notification");
    }

    //Before we get any issues, let's start fresh and initalize everything
    blnTimeCardStatusInitialized = false;
    blnPageLoaded = false;
    totalTotal = 0;

    //Disable the submit button as starting point
    //document.getElementById("submit-button").innerHTML = '<img id="submit-image" class="disabled-image" src="images/log-weekly-hours-to-submit.png" height="33" />';
    document.getElementById("submit-image").src = "images/log-weekly-hours-to-submit.png";
    timecardStatus = "entry";

    //Clear out all of our issue grouops
    document.getElementById('all-issue-groups-container').innerHTML = "";

    //And clear the totals row      
    if (document.getElementById("totals-issue-id"))
        document.getElementById("totals-issue-id").parentNode.removeChild(document.getElementById("totals-issue-id"));

    //Now run each issue group query from the workgroup
    workgroup.issueGroups.forEach(function(issueGroup) {
        //Run Isssue Group quer and load the issues.
        loadGroupIssues(issueGroup);
    })
}

/****************
loadGroupIssues
****************/
function loadGroupIssues(issueGroup) {

    var myJQL = "";
    var lookupString = "";

    //See what we have for saved collspase setting for this issue group
    var expandKeyName = issueGroup.key + "-expand";
    chrome.storage.local.get(expandKeyName, function(data) {
        if (data) {
            if (data[expandKeyName]) {
                issueGroup.expandGroup = true;
            }
            else {
                if (data == null || typeof data === 'undefined' || data.length <= 0) {
                    issueGroup.expandGroup = false;
                }
                else {
                    issueGroup.expandGroup = false;
                }
            }
        }
        else {
            issueGroup.expandGroup = true;
        }
        
        //Initialize our issue group counters
        issueGroup.dayTotals = [0, 0, 0, 0, 0, 0, 0];
        issueGroup.timeTotal = 0;

        // Create the query
        myJQL = issueGroup.query;
        myJQL = myJQL.replace(/user.name/gi, userToRun.name);
        myJQL = myJQL.replace(/user.userid/gi, userToRun.userid);
        myJQL = myJQL.replace(/user.email/gi, userToRun.email);

        var dateToUseStart = new Date(firstDay);
        //dateToUseStart.setDate(dateToUseStart.getDate() - 7);           
        myJQL = myJQL.replace(/_TIMECARDSTART_/gi, ISODate(dateToUseStart));

        var dateToUseEnd = new Date(lastDay);
        dateToUseEnd.setDate(dateToUseEnd.getDate() + 1);
        myJQL = myJQL.replace(/_TIMECARDEND_/gi, ISODate(dateToUseEnd));          

        //If for specific issues, load them here
        if (myJQL.includes("_ISSUEKEYS_")) {
            if (lookupIssueKeys.length > 0) {
                for (var i=0;i<lookupIssueKeys.length;i++) {
                    if (lookupString.length > 0)
                    lookupString = lookupString + ", " + lookupIssueKeys[i];
                    else
                    lookupString = lookupIssueKeys[i];
                };
                myJQL = myJQL.replace(/_ISSUEKEYS_/gi, lookupIssueKeys);   
    
            }
            else {
                //No issue ids to lookup
                myJQL = "summary ~ alvis-time-dude";
            }  
        }

        //Initialize our tracking elements
        issueGroup.issuesProcessed = 0;
        issueGroup.issuesLoaded = false;
    
        //Put in a limit
        myJQL = myJQL + "&maxResults=500"

        //Log the query
        console.log("Alvis Time: Doing a query - " + issueGroup.key + " JQL:" + myJQL);

        //Let run it and get the issues
        JIRA.getIssues(myJQL, issueGroup)
            .then(onIssueFetchSuccess, function (error) {
    
                console.log("Alvis Time: Issue fetch error - ", JSON.parse(JSON.stringify(error)));

                //Show the error
                genericResponseError(error);

                if (error.response.errorMessages.length > 0 && error.response.errorMessages[0].includes("for field 'issueKey' is invalid.")) {
                    //Took error, so remove most recently added issue id
                    let popped = lookupIssueKeys.pop();

                    console.log("Alvis Time: Removed - ", JSON.parse(JSON.stringify(popped)));

                    //Relaod with new set
                    loadGroupIssues(issueGroup);
                }
                else {
                    //All done, some weird error
                    togglePageBusy(false);

                    console.log("Alvis Time: Wierd Error - ", JSON.parse(JSON.stringify(error)));
                }
            });
    }); 
}

/****************
Fetch for issues was Successful -
****************/
function onIssueFetchSuccess(responseObject) {

    //console.log("HERE IS THE RESULT SET:", JSON.parse(JSON.stringify(responseObject)));

    //ResponseObject conatains "response" and "issuesGroup" objects - assign our retreived issues ot the issueGroup
    responseObject.issueGroup.issues = responseObject.issues;

    //Document how many we have
    //console.log("Alvis Time: We are processing a # of issues: " + responseObject.issueGroup.issues.length);

    //Let's process each issue
    responseObject.issueGroup.issues.forEach(function(issue) {

        //Log it as awe go
        //console.log("Alvis Time: Doing issue: " + issue.key);

        //Initialize our worklogs we will be showing
        initializeWorkLogArray(issue);
        
        //Initialize our tracking elements
        issue.worklogsProcessed = 0;
        issue.worklogsLoaded = false;

        //Now get the worklogs and fill in the objects 
        JIRA.getIssueWorklogs(issue.id, firstDay.getTime() / 1000, issue, responseObject.issueGroup)
        .then(onWorklogFetchSuccess, onWorklogFetchError);

        //Increment the issue done count 
        responseObject.issueGroup.issuesProcessed++; 

    });

    //Set the flag saying we did this one
    responseObject.issueGroup.issuesLoaded = true;

}

/****************
Got Worklog Successfully -
****************/    
function onWorklogFetchSuccess(responseObject) {

    var dayIndex;
    var blnDone = true;
    var blnShowIt = false;
    var cleanupWorklog;

    //ResponseObject conatains "response", "issueGroup" and "issue" objects, assign our worklogs to the issue object
    responseObject.issue.worklogs = responseObject.worklogs;

    //Process each worklogs?  Or just store them to be used yet?
    responseObject.issue.worklogs.forEach(function (worklog) {

        //We only want the worklogs with a comment wnd it is tagged for this user
        blnShowIt = false;

            if (typeof worklog.comment != "undefined") {
            if (worklog.comment.includes(userToRun.userid + "|")) {
                blnShowIt = true;
            } else if (worklog.comment.includes("|entry") || worklog.comment.includes("|submitted") || worklog.comment.includes("|approved")) {
                blnShowIt = false; //Includes somoeone elsess mark
            } else if (worklog.author.name == userToRun.userid) {
                console.log("JORDAN - FOUND A WORKLOG: ", JSON.parse(JSON.stringify(worklog)))
                //Entered manually, so add entry comment
                updateWorklogComment(worklog, userToRun.userid + "|" + userToRun.email + "|entry");
                blnShowIt = true;
            } 
            else {
                //onsole.log("TEST: " + worklog.author.key + " VS " + userToRun.userid);
            }
        } else if (worklog.author.name == userToRun.userid) {
            console.log("JORDAN - FOUND A WORKLOG: ", JSON.parse(JSON.stringify(worklog)))
            //Entered manually, so add entry comment
            updateWorklogComment(worklog, userToRun.userid + "|" + userToRun.email + "|entry");
            blnShowIt = true;
        }

        if (blnShowIt) {

            //Now lets process our worklog - filter date range and user id from comments
            var myTimeLogDateStarted = new Date(worklog.started);

            //Now convert to CT for compare
            if (myTimeLogDateStarted.getTimezoneOffset() == 300) {
                //Central time - leave it
            }
            else {
                //Diff time zone - convert for comparison
                myTimeLogDateStarted = convertToCentralTime(myTimeLogDateStarted);
            }
            //console.log("COMPARING " + firstDay + " <= " + myTimeLogDateStarted + " <= " + lastDay);

            ////OK, we only want worklogs in our date range - Be careful in those date comparisons, lastDay shouldbe MIDNIGHT on last day 23/59/59 - startDay should be 00/00/00 in the AM
            if (myTimeLogDateStarted <= lastDay && myTimeLogDateStarted >= firstDay) {

                //OK, we have match user and date - do something with it
                //Determined what bucket it goes in SAT-FRI
                //Translate the day of the week starting Monday vs Saturday
                switch(myTimeLogDateStarted.getDay()) {
                    case 6: //Saturday
                        dayIndex = 0
                        break;
                    case 0: //Sunday
                        dayIndex = 1;
                        break;
                    case 1: //Monday
                        dayIndex = 2;
                        break;
                    case 2: //Tuesday
                        dayIndex = 3;
                        break;
                    case 3: //Wednesday
                        dayIndex = 4;
                        break;
                    case 4: //Thursday
                        dayIndex = 5;
                        break;
                    case 5: //Friday
                        dayIndex = 6;
                        break;
                    default:
                }
                
                //IF we have MULTIPLE entires for same person, same, ticket, same date...clean them up.  Let's have one
                if (responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent > 0) {

                    //We have multipel per day, so add hours and update latest tix
                    responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent = responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent + (worklog.timeSpentSeconds / 3600);
                    
                    //Add to our cleanup array - will hold these and clean up at the end
                    addToCleanup(responseObject.issue.id, responseObject.issue.worklogDisplayObjects[dayIndex].worklogId, responseObject.issue.worklogDisplayObjects[dayIndex].worklogComment, responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent, responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeStarted);
                    addToCleanup(responseObject.issue.id, worklog.id, worklog.comment, 0, responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeStarted);

                }
                    else {
                    //OK, lets load it into our display objects for this issue -what to do if dups?
                    responseObject.issue.worklogDisplayObjects[dayIndex].worklogId = worklog.id;
                    responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeStarted = worklog.started;
                    responseObject.issue.worklogDisplayObjects[dayIndex].worklogComment = worklog.comment;
                    responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent = worklog.timeSpentSeconds / 3600;
                    responseObject.issue.worklogDisplayObjects[dayIndex].worklogDayOfWeek = dayIndex;
                }



                //Add to our issue, issue group, day and total totals
                responseObject.issue.issueTotalTime = responseObject.issue.issueTotalTime + (worklog.timeSpentSeconds / 3600);
                responseObject.issueGroup.dayTotals[dayIndex] = responseObject.issueGroup.dayTotals[dayIndex] +  (worklog.timeSpentSeconds / 3600);
                responseObject.issueGroup.timeTotal = responseObject.issueGroup.timeTotal + (worklog.timeSpentSeconds / 3600);
                totalTotal = totalTotal + (worklog.timeSpentSeconds / 3600);

            }
        }              
            
        //Increment out tracker
        responseObject.issue.worklogsProcessed++;

    })

    //Keep track that we loaded em
    responseObject.issue.worklogsLoaded = true;

    //Now lets see if we are done - go thru all issues groups and issues, issues processed = total for the issue group and worklogs processeed = total for each issue
    workgroup.issueGroups.forEach(function(issueGroup) {
        
        //For each work group, did we process the issues?
        if (issueGroup.issuesLoaded) {
            if (issueGroup.issuesProcessed == issueGroup.issues.length) {
                //We have processed all the issues - lets check worklogs
                issueGroup.issues.forEach(function(issue) {
                    //For each issue, did we process it and get the worklogs?
                    if (issue.worklogsLoaded) {
                        if (issue.worklogsProcessed == issue.worklogs.length) {
                            //This one all done
                        }
                        else {
                            //Not done yet - not done with worklogs
                            blnDone = false;
                        }
                    }
                    else {
                        //Not done yet - not started with worklogs
                        blnDone = false;
                    }
                })
            }
            else {
                //Not done yet - not done with issues
                blnDone = false;    
            }
        }
        else {
            //blnDone done yet - not started with issues
            blnDone = false;
        }
    })

    //See if we are done
    if (blnDone) {
        //All done loading stuff.  Now let's do any cleanup
        doTimecardCleanup();
        //We are done gathering all of our data. Now lets build out our UI.
        if (!blnPageLoaded) {
            //Keeping track 
            blnPageLoaded = true;
            
            //Show the page
            timecardPageLoad(); //This will load all of the data to the page
        } 
    }
}

/****************
generateTeamReport
****************/
function generateTeamReport(inputReport) {

    //For our query
    var myJQL = "";
    var myUserQuery = "";

    //Initialize counts
    reportWorkLogFetchCount = 0;
    reportIssueCount = 0;
    reportObject = {};
    reportIssues = [];
    reportIssueWorklogs = [];

    //We are busy
    togglePageBusy(true);

    //Now lets see if we are done - go thru all issues groups and issues, issues processed = total for the issue group and worklogs processeed = total for each issue
    workgroup.reports.forEach(function(report) {

        if (report.key == inputReport) {

            //Add report to our hold hobject
            reportObject.report = report;

            //Add users to the list
            if (blnAdmin || blnViewer) {
                workgroup.users.forEach(function(user) {
                    if (myUserQuery.length > 0) {
                        myUserQuery = myUserQuery + " OR " + report.userQuery.replace(/user.userid/gi, user.userid);
                    }
                    else {
                        myUserQuery = report.userQuery.replace(/user.userid/gi, user.userid);
                    }
                    //"userQuery": "worklogComment ~ 'user.userid'", 
                });
            }
            else {
                myUserQuery = report.userQuery.replace(/user.userid/gi, userToRun.userid);
            }

            myJQL = report.query;
            myJQL = myJQL.replace(/_USERQUERY_/gi, myUserQuery); 

            var dateToUseStart = new Date(firstDay);
            //dateToUseStart.setDate(dateToUseStart.getDate() - 7);           
            myJQL = myJQL.replace(/_TIMECARDSTART_/gi, ISODate(dateToUseStart));
    
            var dateToUseEnd = new Date(lastDay);
            dateToUseEnd.setDate(dateToUseEnd.getDate() + 1);
            myJQL = myJQL.replace(/_TIMECARDEND_/gi, ISODate(dateToUseEnd));      
            
            myJQL = myJQL + "&maxResults=500"

            //Log the query
            console.log("Alvis Time: Doing a report - JQL:" + myJQL);

            //Let run it and get the issues
            JIRA.getReportIssues(myJQL, report)
                .then(onIssueReportSuccess, function (error) {

                console.log("Alvis Time: Report fetch error - ", JSON.parse(JSON.stringify(error)));

                //Show the error
                genericResponseError(error);

                //All done, some weird error
                togglePageBusy(false);

            });
        }
    });


}

/****************
onIssueReportSuccess -
****************/ 
function onIssueReportSuccess(responseObject) {

      //Let's process each issue
    reportIssueCount = responseObject.issues.length;
    responseObject.issues.forEach(function(issue) {

        //Initialize our tracking elements
        issue.worklogsProcessed = 0;
        issue.worklogsLoaded = false;
        issue.report = responseObject.report;

        //Now get the worklogs and fill in the objects 
        JIRA.getIssueWorklogs(issue.id, firstDay.getTime() / 1000, issue, responseObject.issueGroup)
        .then(onReportWorklogFetchSuccess, function (error) {

            console.log("Alvis Time: Report worklog fetch error - ", JSON.parse(JSON.stringify(error)));

            //Show the error
            genericResponseError(error);

            //All done, some weird error
            togglePageBusy(false);
        });

    });
}

/****************
Report Worklog Fetch Success -
****************/    
function onReportWorklogFetchSuccess(responseObject) {

    console.log("AJH REPORT GOT A worklog", JSON.parse(JSON.stringify(responseObject)));
   
    //Process each worklogs?  Or just store them to be used yet?
    responseObject.worklogs.forEach(function (worklog) {

       //Now lets process our worklog - filter date range and user id from comments
       var worklogDate = new Date(worklog.started);

       //Now convert to CT for compare
       if (worklogDate.getTimezoneOffset() == 300) {
           //Central time - leave it
       }
       else {
           //Diff time zone - convert for comparison
           worklogDate = convertToCentralTime(worklogDate);
       }

       console.log("COMPARING: " + firstDay + " VS" + worklogDate + " VS " + lastDay);
       if (worklogDate <= lastDay && worklogDate >= firstDay) {

            console.log("COMPARING HIT!: " + firstDay + " VS" + worklogDate + " VS " + lastDay);

           //Build users selection list
           for (var u=0; u < workgroup.users.length; u++) {
               if (worklog.comment.includes(workgroup.users[u].userid + "|")) {

                    console.log("ADDING A WORKLOG: ", JSON.parse(JSON.stringify(worklog)));

                    //Add the worklog to the issue
                    if (!responseObject.issue.worklogs) {
                        responseObject.issue.worklogs = [];
                    }
                    responseObject.issue.worklogs.push(worklog);

                   //It is for this user and it si for this week, add it up

               }
           }
       }

    })

    //Add it to collection
    reportIssues.push(responseObject.issue);

    //Now we need to see if we are done
    reportWorkLogFetchCount = reportWorkLogFetchCount + 1;
    console.log("AJH TESTING IF WE ARE DONE: " + reportWorkLogFetchCount + " VS " + reportIssueCount);


    //Here is where we are done - no, reportObject --> issues --> worklogs
    if (reportWorkLogFetchCount == reportIssueCount) {
        //We completed extract of workitems for a report - cool
        console.log("Alvis Time: Completed report extract. Issue count:" + reportIssueCount);

        //Add report to our hold hobject
        reportObject.issues = reportIssues;

        showReport(reportObject);

    }

}


/****************
addToCleanup -
****************/ 
function addToCleanup(worklogIssueId, worklogId, worklogComment, worklogTimeSpent, worklogTimeStarted) {
    
    var blnFound = false;

    //First, see if we already have this worklogId in the array
    worklogCleanupArray.forEach(function(cleanupWorklog) {

        if (cleanupWorklog.id == worklogId) {
            if (!cleanupWorklog.processed) {
                //Got one
                cleanupWorklog.timeSpent = worklogTimeSpent;
                console.log("CLEANUP LOG ALREADY EXISTS - DOING UPDATE FOR " + worklogId + " TIME SPENT:" + cleanupWorklog.timeSpent);
            }
            blnFound = true;
        }
    });      

    //If not found, add it to the array
    if (!blnFound) {
        //Add to our cleanup array
        var cleanupWorklog = {
            issueId: worklogIssueId,
            id: worklogId,
            comment: worklogComment,
            timeSpent: worklogTimeSpent,
            started: worklogTimeStarted, 
            processed: false                      
        }
        worklogCleanupArray.push(cleanupWorklog);
        console.log("AJH ADDED ENTRY TO CLEANUP " + worklogId + " TIME SPENT:" + cleanupWorklog.timeSpent);
    }

}

/****************
Time Card cleanup -
****************/ 
function doTimecardCleanup() {

    //Let's process each issue
    worklogCleanupArray.forEach(function(cleanupLog, index, object) {

        if (!cleanupLog.processed) {

            //Now we will clean out the entry from the array       
            cleanupLog.processed = true;
            console.log("Alvis Time: Processed cleanup for a worklog", JSON.parse(JSON.stringify(cleanupLog)));

            //Call JIRA to update the comment
            if (true) {
                JIRA.updateWorklog(cleanupLog.issueId, cleanupLog.id, cleanupLog.comment, cleanupLog.timeSpent, cleanupLog.started)
                .then(function(data) {
                    //Success
                    notificationMessage(workgroup.messages.workLogConverted.replace(/_ISSUE_/gi, cleanupLog.issueId).replace(/_WORKLOG_/gi, cleanupLog.id), "notification");
    
                }, function(error) {
                    //Failure
                    genericResponseError(error);
                });
            }

        }

    });

}



/****************
convertToCentralTime -
****************/ 
function convertToCentralTime(inputTimeStarted) {

    var utc = inputTimeStarted.getTime() + (inputTimeStarted.getTimezoneOffset() * 60000);
    var offset = inputTimeStarted.getTimezoneOffset() / 60;
    var newTime = new Date(utc + (3600000*offset));

    return newTime;

}

/****************
Got Worklog Failed -
****************/    
function onWorklogFetchError(error) {
    // hide loading inspite the error
    loader.style.display = 'none';
    genericResponseError(error);
}

/****************
Update the WorkLog Comment
****************/    
function updateWorklogComment(worklog, inputComment) {
    console.log("Alvis Time: Updating comment to " + inputComment, JSON.parse(JSON.stringify(worklog)));

    if (worklog.comment.length > 0) {
        worklog.comment = worklog.comment + "\r\n" + inputComment;
    }
    else {
        worklog.comment = inputComment;
    }

    //Call JIRA to update the comment
    JIRA.updateWorklog(worklog.issueId, worklog.id, worklog.comment, worklog.timeSpent, worklog.started)
    .then(function(data) {
        //Success
        notificationMessage(workgroup.messages.workLogConverted.replace(/_ISSUE_/gi, worklog.issueId).replace(/_WORKLOG_/gi, worklog.id), "notification");
    }, function(error) {
        //Failure
        genericResponseError(error);
    });
    console.log("Alvis Time: Updated it! ");

}

/****************
loadWorkgroupTimeCards
****************/
function loadWorkgroupTimeCards() {

    var myJQL = "";
    var myUserQUery = "";



    //Initialize our tracker to know when done
    tcIssueCountTracker = 0;

    // Create the query
    myJQL = workgroup.workgroupTimeCardQuery;

    //Build users selection list
    for (var u=0; u < workgroup.users.length; u++) {
        workgroup.users[u].timecardHours = 0;
        workgroup.users[u].timecardStatusColor = "black";
        if (myUserQUery.length > 0) {
            myUserQUery = myUserQUery + " OR worklogComment ~ '" + workgroup.users[u].userid + "|'"
        }
        else {
            myUserQUery = "worklogComment ~ '" + workgroup.users[u].userid + "|'"
        }
    }       

    //Starting fresh
    doUserSelect();

    //Only do this break out of people and time card status if it is enabled
    if (!blnDoUserTimecardSummaryView) {
        togglePageBusy(false);
        return false;
    }

    //We are busy
    togglePageBusy(true);

    var dateToUseEnd = new Date(lastDay);
    dateToUseEnd.setDate(dateToUseEnd.getDate() + 1);    

    myJQL = myJQL.replace(/_BEGINDATE_/gi, ISODate(firstDay));
    myJQL = myJQL.replace(/_ENDDATE_/gi, ISODate(dateToUseEnd)); //Anythign before the day after end date
    myJQL = myJQL.replace(/_WORKLOGUSERQUERY_/gi, myUserQUery);
    myJQL = myJQL + "&maxResults=500"

    //Log the query
    console.log("Alvis Time: Doing a query for timecards - " + myJQL);

    //Let run it and get the issues
    JIRA.getTimeCardIssues(myJQL)
        .then(onTimecardIssueFetchSuccess, function (error) {

            console.log("Alvis Time: Issue fetch error - ", JSON.parse(JSON.stringify(error)));

            //Show the error
            genericResponseError(error);

            //All done, some weird error
            togglePageBusy(false);            
    });
}


/****************
Fetch for timecard issues was Successful -
****************/
function onTimecardIssueFetchSuccess(responseObject) {

    //console.log("HERE IS THE RESULT SET:", JSON.parse(JSON.stringify(responseObject)));

    //Document how many we have
    //console.log("Alvis Time: We are processing a # of issues for timecards - " + responseObject.issues.length);

    //Hang onto issue count so we know we are done
    tcIssueCount = responseObject.issues.length;

    //Let's process each issue
    responseObject.issues.forEach(function(issue) {

        //Log it as awe go
        console.log("Alvis Time: Doing timecard issue: " + issue.key);

        //Initialize our tracking elements
        issue.worklogsProcessed = 0;
        issue.worklogsLoaded = false;

        

        //Now get the worklogs and fill in the objects 
        JIRA.getIssueWorklogs(issue.id, firstDay.getTime() / 1000, issue, {})
        .then(onTimecardWorklogFetchSuccess, onTimecardWorklogFetchError);

    });

}

/****************
Got Worklog Successfully -
****************/    
function onTimecardWorklogFetchSuccess(responseObject) {

    //ResponseObject conatains "response", "issueGroup" and "issue" objects, assign our worklogs to the issue object
    responseObject.issue.worklogs = responseObject.worklogs;

    //console.log("Alvis Time: We are processing a # of worklogs for timecards - " + responseObject.issue.id + " = " + responseObject.worklogs.length);

    tcIssueCountTracker = tcIssueCountTracker + 1;

    //Process each worklogs?  Or just store them to be used yet?
    responseObject.issue.worklogs.forEach(function (worklog) {

        //Now lets process our worklog - filter date range and user id from comments
        var myTimeLogDateStarted = new Date(worklog.started);

        if (myTimeLogDateStarted <= lastDay && myTimeLogDateStarted >= firstDay) {

            //Build users selection list
            for (var u=0; u < workgroup.users.length; u++) {
                if (worklog.comment.includes(workgroup.users[u].userid + "|")) {
                    //It is for this user and it si for this week, add it up
                    workgroup.users[u].timecardHours = workgroup.users[u].timecardHours + (worklog.timeSpentSeconds / 3600);
                    console.log("Alvis Time: Timecard entry added to user " + workgroup.users[u].userid + " = " + workgroup.users[u].timecardHours);

                    //And do status
                    if (worklog.comment.includes("|submitted")) {
                        //Submitted = red
                        workgroup.users[u].timecardStatusColor = "red";
                    }
                    if (worklog.comment.includes("|approved")) {
                        //Approved = green
                        workgroup.users[u].timecardStatusColor = "green";
                    }
                }
            }
            }
    })

    if (tcIssueCountTracker == tcIssueCount) {
        //Done - Build users selection list
        doUserSelect();
    }
}

/****************
Got Worklog Failed -
****************/    
function onTimecardWorklogFetchError(error) {
    // hide loading inspite the error
    loader.style.display = 'none';
    genericResponseError(error);
}

/****************
doUserSelect -
****************/    
function doUserSelect() {

    var userOptions = "";
    var saveColor = "black";
    var hoursDisplay = "";
    for (var u=0; u < workgroup.users.length; u++) {

        if (workgroup.users[u].timecardHours > 0)
            hoursDisplay = " (" + workgroup.users[u].timecardHours  + ")";
        else 
            hoursDisplay = "";

        if (workgroup.users[u].name == userToRun.name) {
            userOptions = userOptions + "<option style='background:" + workgroup.users[u].timecardStatusColor + ";color:white;font-weight: bold;font-size:16px' selected value='" + workgroup.users[u].name + "'>" + workgroup.users[u].name + hoursDisplay + "</option>";
            saveColor = workgroup.users[u].timecardStatusColor;
        }
        else {
            userOptions = userOptions + "<option style='background:" + workgroup.users[u].timecardStatusColor + ";color:white;font-weight: bold;font-size:16px' value='" + workgroup.users[u].name + "'>" + workgroup.users[u].name + hoursDisplay + "</option>";

        }
        } // Black = Entry/Nothing, Red = Submitted, Green = Approved,            

    document.getElementById("user-select").innerHTML = "<select style='background:" + saveColor + ";color:white;font-weight: bold;font-size:16px' id='user-selection'>" + userOptions + "</select><div class='user-name-display'>&nbsp; " + workgroup.titles.welcome + " " + user.name + " - " + workgroup.name + "</div>";
    document.getElementById("user-selection").addEventListener ("change", function(){ changeuser(this.value)});

    togglePageBusy(false);

}     



/****************
Time Card Page - laods up the page with all the data -
****************/    
function timecardPageLoad() {

    //Just in case we haven't done this yet
    togglePageBusy(true);

    //For each issue group, for each issue, for each work log
    workgroup.issueGroups.forEach(function(issueGroup, issueGroupIndex) {

        //Draw the issue group - it is the dropdown sub-grouping
        drawIssueGroupTable(issueGroup, issueGroupIndex);

        //If our lookup group, save it
        if (issueGroup.key == "lookup") {
            lookupIssueGroup = issueGroup;
            lookupIssueGroupIndex = issueGroupIndex;
        }
    })
    
    //Now have to do the total row
    var row = generateTotalsRow(workgroup.issueGroups);

    //And add it to our issue group table
    document.getElementById("total-issue-group-table").appendChild(row);   

    //Wire up the issue search button
    document.getElementById("issue-search").addEventListener ("click", event => {

        //Expand group, if not already expanded
        if (!lookupIssueGroup.expandGroup) {
            lookupIssueGroup.expandGroup = true;
            document.getElementById(lookupIssueGroup.key + "-details").open = lookupIssueGroup.expandGroup;
        }

        //Setup our storage keys to save the collapse setting for this group
        var expandKeyName = lookupIssueGroup.key + "-expand";
        var expandKeyObj = {};
        expandKeyObj[expandKeyName] = document.getElementById(lookupIssueGroup.key + "-details").open;
        chrome.storage.local.set(expandKeyObj, function () {
            lookupIssueGroup.expandGroup = document.getElementById(lookupIssueGroup.key + "-details").open;
        });


        //Stop event from propogating up
        event.stopPropagation();
        event.preventDefault();

        //See if we already have it
        if (issueExists(lookupIssueGroup.JiraProjectKey + "-" + document.getElementById("issue-id").value)) {
            //already have it           
            notificationMessage(lookupIssueGroup.JiraProjectKey + "-" + document.getElementById("issue-id").value + " already exists", "error"); 
            //Clear out input field
            document.getElementById("issue-id").value = "";
        }
        else {
            //Do not have it, so add it to our list
            lookupIssueKeys.push(lookupIssueGroup.JiraProjectKey + "-" + document.getElementById("issue-id").value);

            //Already have it message     
            notificationMessage(lookupIssueGroup.JiraProjectKey + "-" + document.getElementById("issue-id").value + " added to list", "alert"); 

            //Added an issue to our set, so reset everything
            processIssueGroups("addedissue");

        }

        return false;

    });

    //Setup our button
    setButtonStatus();
    
    //Enable the page
    togglePageBusy(false);

    //If we recent page is summary, go to it
    if (recentPage == "timecard-summary")
        showTimeCardSummary();

}

/****************
Find issue in our issue Groups - and put focus there
****************/
function issueExists(inputIssueKey) {

    var blnResponse = false;
    var locationKey;

    //Go thru each issue group, each issue and find it
    for (var g=0;g<workgroup.issueGroups.length;g++) {
        for (var i=0;i<workgroup.issueGroups[g].issues.length;i++) {
            //See if this issue matches
            if (workgroup.issueGroups[g].issues[i].key == inputIssueKey) {
                //we have a match
                locationKey = workgroup.issueGroups[g].key + "+" + g + "+" + workgroup.issueGroups[g].issues[i].id + "+" + i + "+" + 2; //2 for Monday
                //alert("LOCATION KEY IS: " + locationKey);
                
                //Expand if not already expanded
                if (!workgroup.issueGroups[g].expandGroup) {
                    workgroup.issueGroups[g].expandGroup = true;
                    document.getElementById(workgroup.issueGroups[g].key + "-details").open = workgroup.issueGroups[g].expandGroup;
                }
                document.getElementById(locationKey).focus(); 
                document.getElementById(locationKey).select();

                blnResponse = true;
                return blnResponse;
            }
        }
    };

    return blnResponse;

}


/****************
Set Button Status based on our data
****************/    
function setButtonStatus() {

    //For viewers, turn it off
    if (blnViewer) {
        document.getElementById("submit-image").style.display = 'none';
        document.getElementById('reject-button').style.display = 'none';
        setWorklogEnabled(false);
        return;
    }

    //And set our button as well as enabling input - log hours, submit, submitted, approved. Need 1) Total hours 2) Status of all issues
    switch (timecardStatus) {
        case "approved":
            document.getElementById("submit-image").src = "images/approved.png";
            document.getElementById("submit-image").className = "disabled-image";
            document.getElementById('reject-button').style.display = 'none';
            setWorklogEnabled(false);
            break;
        case "submitted":
            if (blnAdmin) {
                document.getElementById("submit-image").src = "images/click-to-approve.png";
                document.getElementById("submit-image").className = "enabled-image";
                setWorklogEnabled(true);

                //And we weill need a reject - which reverst back to entry (pre-submitted)
                document.getElementById('reject-button').style.display = 'block';
                document.getElementById("reject-button").className = "enabled-image";
            }
            else {
                document.getElementById("submit-image").src = "images/submitted-for-approval.png";
                document.getElementById("submit-image").className = "disabled-image";
                document.getElementById('reject-button').style.display = 'none';
                setWorklogEnabled(false);
            }
            break;
        default: //same as "entry" and "submit-for-approval"
            if (totalTotal >= userToRun.minHoursToSubmit) {
                document.getElementById("submit-image").src = "images/submit-for-approval.png";
                document.getElementById("submit-image").className = "enabled-image";
                document.getElementById('reject-button').style.display = 'none';
                timecardStatus = "submit-for-approval";
                setWorklogEnabled(true);
            }
            else {
                document.getElementById("submit-image").src = "images/log-weekly-hours-to-submit.png";
                document.getElementById("submit-image").className = "disabled-image";
                document.getElementById('reject-button').style.display = 'none';
                timecardStatus = "entry";
                setWorklogEnabled(true);
            }
            break;
    }
}


/****************
Initialize the Work Log array wew will be showing for a given issue
****************/    
function initializeWorkLogArray(issue) {

    //Reset our worklog display objects array

    issue.worklogDisplayObjects = [];
    issue.issueTotalTime = 0;

    //Load and initialize the worklog objects, one for each day of the week for this issue
    for (var j = 0; j < 7; j++) {
    
        //We want to do this for the days of the week, so dayDay + j
        var nextDay = new Date(firstDay); //This should be the selected weeks view Saturday - shwihc is FirstDay 
        nextDay.setDate(nextDay.getDate() + j);
        var startOfTheDay = new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate(), 0, 0, 0, 0);

        //This is our worklogDisplayObject
        var worklogDisplayObect = {
            "worklogIssueId": issue.id,
            "worklogId": 0,
            "worklogTimeStarted": startOfTheDay,
            "worklogTimeSpent": 0,
            "worklogComment": userToRun.userid + "|" + userToRun.email + "|entry",  //We are using comment to hold person's users ID + email address who logged for + entry/submitted/approved status - new entries are "entry' status
            "worklogDayOfWeek": ""
        }

        //Now add the entry to the issue object
        issue.worklogDisplayObjects.push(worklogDisplayObect);

    }
}         


/****************
Value change handler - when update happens, post it back to Jira
****************/   
function postWorklogTimeChange(worklogChangeItem) {

    var blnValid = true;  //Boolean to hold validity flag for the entry

    //Reset if any error message was set
    notificationMessage(workgroup.messages.waiting, "notification");

    //Lets disable the page
    togglePageBusy(true);

    //Info stored in the id for group, issue, etc.
    var idParts = worklogChangeItem.id.split("+");
    var issueGroupKey = idParts[0];
    var issueGroupIndex = idParts[1];
    var issueId = idParts[2];
    var issueIndex = idParts[3];
    var workLogIndex = idParts[4];

    var issueGroupObject = workgroup.issueGroups[issueGroupIndex];
    var issueObject = workgroup.issueGroups[issueGroupIndex].issues[issueIndex];
    var workLogObject = workgroup.issueGroups[issueGroupIndex].issues[issueIndex].worklogDisplayObjects[workLogIndex];

    var worklogDisplayObject = {
        "worklogIssueId": issueObject.id,
        "worklogId": 0,
        "worklogTimeStarted": workLogObject.worklogTimeStarted,
        "worklogTimeSpent": 0,
        "worklogComment": workLogObject.worklogComment, 
        "worklogDayOfWeek": workLogIndex
    }       

    //Validate it first
    if (worklogChangeItem.value.length <= 0) {
        worklogChangeItem.value = 0;
    }
    
    if (isNaN(worklogChangeItem.value)) {
        blnValid = false; //Not a number
        notificationMessage(workgroup.messages.hoursNumeric, "error");
    }
    else if (!Number.isInteger(worklogChangeItem.value * 4)) {
        blnValid = false; //Not a 15 minute increment .25,.5.75
        notificationMessage(workgroup.messages.hoursIncrements, "error");
    }
    else if (worklogChangeItem.value > 16) {
        blnValid = false; //Really? 16 hours a day should be enough
        notificationMessage(workgroup.messages.hoursTooMany, "error");
    }
    else if (worklogChangeItem.value < 0) {
        blnValid = false; //Sorry Charlie - no negatives
        notificationMessage(workgroup.messages.hoursPositive, "error");
    }
    else if (workLogObject.worklogTimeSpent == worklogChangeItem.value) {
        blnValid = false; //No change so skip it
        togglePageBusy(false);
        return;
    }

    if (blnValid) {

        //turn it blue as we are updating it...
        worklogChangeItem.style.color = "#0000ff";

        //Here we post the update
        JIRA.updateWorklog(workLogObject.worklogIssueId, workLogObject.worklogId, workLogObject.worklogComment, worklogChangeItem.value, getStartedTime(workLogObject.worklogTimeStarted))
            .then(function(responseWorklogObject) {
            //Success
            notificationMessage(workgroup.messages.hoursChangeSuccess.replace(/_TIMEBEGIN_/gi, workLogObject.worklogTimeStarted).replace(/_TIMEENTRY_/gi, worklogChangeItem.value), "notification");

            //If we have 0 hours, this worklog was deleted
            if (worklogChangeItem.value == 0) {
                if (responseWorklogObject == null) {
                    //Empty as we deleted it
                    worklogDisplayObject.worklogIssueId = issueObject.id;
                    worklogDisplayObject.worklogId = 0;
                    worklogDisplayObject.worklogTimeStarted = workLogObject.worklogTimeStarted;
                    worklogDisplayObject.worklogTimeSpent = 0;
                    worklogDisplayObject.worklogComment = workLogObject.worklogComment;
                    worklogDisplayObject.worklogDayOfWeek = workLogIndex;
                }
                else {
                    worklogDisplayObject.worklogIssueId = issueObject.id;
                    worklogDisplayObject.worklogId = responseWorklogObject.id;
                    worklogDisplayObject.worklogTimeStarted = responseWorklogObject.started;
                    worklogDisplayObject.worklogTimeSpent = responseWorklogObject.timeSpentSeconds / 3600;
                    worklogDisplayObject.worklogComment = responseWorklogObject.comment;
                    worklogDisplayObject.worklogDayOfWeek = workLogIndex;
                }
            }
            else {
                if (responseWorklogObject == null) {
                    worklogDisplayObject.worklogIssueId = issueObject.id;
                    worklogDisplayObject.worklogId = 0;
                    worklogDisplayObject.worklogTimeStarted = workLogObject.worklogTimeStarted;
                    worklogDisplayObject.worklogTimeSpent = 0;
                    worklogDisplayObject.worklogComment = workLogObject.worklogComment;
                    worklogDisplayObject.worklogDayOfWeek = workLogIndex;
                }
                else {
                    worklogDisplayObject.worklogIssueId = issueObject.id;
                    worklogDisplayObject.worklogId = responseWorklogObject.id;
                    worklogDisplayObject.worklogTimeStarted = responseWorklogObject.started;
                    worklogDisplayObject.worklogTimeSpent = responseWorklogObject.timeSpentSeconds / 3600;
                    worklogDisplayObject.worklogComment = responseWorklogObject.comment;
                    worklogDisplayObject.worklogDayOfWeek = workLogIndex;
                }    
            }

            //Update our objects collection with the new worklog entry
            workgroup.issueGroups[issueGroupIndex].issues[issueIndex].worklogDisplayObjects[workLogIndex] = worklogDisplayObject;

            //Update our totals by how much we changed = timespent/seconds
            var deltaTimeSpent = worklogDisplayObject.worklogTimeSpent - workLogObject.worklogTimeSpent;
            issueObject.issueTotalTime = issueObject.issueTotalTime + deltaTimeSpent;
            issueGroupObject.dayTotals[workLogIndex] = issueGroupObject.dayTotals[workLogIndex] + deltaTimeSpent;
            issueGroupObject.timeTotal = issueGroupObject.timeTotal + deltaTimeSpent;
            totalTotal = totalTotal + deltaTimeSpent;

                //And the display values issue Total
            document.getElementById(issueGroupKey + "+" + issueId + "+total").innerText = issueObject.issueTotalTime; 
            
            //Day totals
            document.getElementById("total-total+" + workLogIndex).value = Number(document.getElementById("total-total+" + workLogIndex).value) + deltaTimeSpent;

                //Total-Total - Turn green/red if nwe changed over/under 40
            document.getElementById("total+total+total").innerText = totalTotal;
            if (totalTotal >= userToRun.minHoursToSubmit)
                document.getElementById("total+total+total").style.backgroundColor = "green";
            else
                document.getElementById("total+total+total").style.backgroundColor = "red"; 

            //Gotta update issue group messages
            workgroup.issueGroups.forEach(function(issueGroup) {
                //Issue Group totals
                if (issueGroup.timeTotal > 0) {
                    var issueGroupPercentage = (100 * issueGroup.timeTotal / totalTotal).toFixed(0);
                    if (issueGroupPercentage >= issueGroup.minPercentage) {
                        //Hit threshhold, leave it grean
                        document.getElementById(issueGroup.key + "-issue-group-message").innerText = issueGroup.timeTotal + " hours / " + issueGroupPercentage + "%";
                    }
                    else {
                        //Did not hit threshhold, make it red
                        document.getElementById(issueGroup.key + "-issue-group-message").innerText = issueGroup.timeTotal + " hours / " + issueGroupPercentage + "%";
                        document.getElementById(issueGroup.key + "-issue-group-message").style.color="red";
                    }
                }
                else
                    document.getElementById(issueGroup.key + "-issue-group-message").innerText = issueGroup.timeTotal + " hours / " + 0 + "%";
            })

            //Get latest remaining estimate
            JIRA.getRemainingEstimate(issueId)
            .then(function(responseObject) {
                //Success, update remaining estimate value
                var remainingEstimate = responseObject.fields.timetracking.remainingEstimate;
                remainingEstimate = remainingEstimate.replace("h", "");
                document.getElementById(issueGroupKey + "+" + issueGroupIndex + "+" + issueId + "+" + issueIndex + "+remest").value = remainingEstimate;
            }, function(error) {
                //Failure
                genericResponseError(error);
            });

            //And set our button status
            setButtonStatus();    

            //When posted successfully, turn to blue
            worklogChangeItem.style.color = "#0000ff";

            }, function(error) {
            //Failure
            genericResponseError(error);
        });
        
    }
    else {
        worklogChangeItem.style.color = "#ff0000";
        worklogChangeItem.focus();
    }

    //Lets enable the page
    togglePageBusy(false);

}    


/****************
Pushing time card thru the process by updating all of the status on the worlogs
****************/   
function updateWorklogStatuses(inputAction) {

    //If we are already busy, get out to avoid multiple clicks
    if (!blnInteractive)
        return;

    togglePageBusy(true);
    
    //If status is entry, get outta dodge
    switch (timecardStatus) {
        case "approved":
            break;
        case "submitted":
            if (blnAdmin) {

                if (inputAction == "reject") {
                    //Here is where we updates status to entry (rejected/revert)
                    updateTimecardStatus("submitted", "entry");
                }
                else {
                    //Here is where we updates status to approved
                    updateTimecardStatus("submitted", "approved");
                }

                //Changed status, so reset everything
                processIssueGroups("worklogsubmitted");
            }
            break;
        case "submit-for-approval":
            //Here is where we updates status to submitted - for every worklog object, update status   
            updateTimecardStatus("entry", "submitted");

            if (workgroup.settings.emailOnSubmitForApproval.doSend) {
                sendEmail(workgroup.settings.emailOnSubmitForApproval.subject, workgroup.settings.emailOnSubmitForApproval.message, workgroup.settings.emailOnSubmitForApproval.from, workgroup.settings.emailOnSubmitForApproval.to);
            }

            //Changed status, so reset everything
            processIssueGroups("worklogsubmitforapproval");

        default: //includes "entry"
            break;
    }
    
    togglePageBusy(false);

    return false;
}

/****************
Post the change for remaining estimate
****************/   
function postRemainingEstimateChange(remainingEstimateItem, inputIssue) {

    //If we are already busy, get out to avoid multiple clicks
    if (!blnInteractive)
        return;

    togglePageBusy(true);
    
    //Post update for this remaining estimate
    JIRA.updateRemainingEstimate(inputIssue.id, remainingEstimateItem.value)
    .then(function(data) {
        //Success
        notificationMessage("Updated Estimate for " + inputIssue.key + " to " + remainingEstimateItem.value, "notification");
        //When posted successfully, turn to blue
        remainingEstimateItem.style.color = "#0000ff";

    }, function(error) {
        //Failure, turn to red
        remainingEstimateItem.style.color = "#ff0000";
        genericResponseError(error);
    });

    togglePageBusy(false);

    return false;

}

/****************
Update the status of all of the worklogs for this time card
****************/   
function updateTimecardStatus(fromStatus, toStatus) {

    workgroup.issueGroups.forEach(function(issueGroup) {
        issueGroup.issues.forEach(function(issue) {
            issue.worklogDisplayObjects.forEach(function(workLogObject) {

                if (workLogObject.worklogComment.includes(fromStatus) && Number(workLogObject.worklogId) > 0) {                                                       
                    workLogObject.worklogComment = workLogObject.worklogComment.replace(fromStatus, toStatus);
                        
                    console.log("Alvis Time: Status update " + workLogObject.worklogIssueId + " FROM " + fromStatus + " TO " + toStatus);

                    JIRA.updateWorklog(workLogObject.worklogIssueId, workLogObject.worklogId, workLogObject.worklogComment, workLogObject.worklogTimeSpent, getStartedTime(workLogObject.worklogTimeStarted))
                    .then(function(data) {
                        //Success
                        notificationMessage(workgroup.messages.statusChangeSuccess.replace(/_FROM_/gi, fromStatus).replace(/_TO_/gi, toStatus), "notification");

                    }, function(error) {
                        //Failure
                        genericResponseError(error);
                    });
                    
                }
            })
        })
    })
}

/****************
Set all of the worklog entry fields enabled/disabled based on status
****************/  
function setWorklogEnabled(inputEnabled) {

    //For each worklog we have in our set, disable/enable the data entry
    workgroup.issueGroups.forEach(function (issueGroup, issueGroupIndex) {

        issueGroup.issues.forEach(function(issue, issueIndex) {
            for (var w = 0; w < 7; w++) {

                var workLogEntry = document.getElementById(issueGroup.key + "+" + issueGroupIndex + "+" + issue.id + "+" + issueIndex + "+" + w);

                //Weird logic here due to how the disabled property works
                if (workLogEntry.disabled != !inputEnabled) {
                    workLogEntry.disabled = !inputEnabled;
                }
                else {
                    //what?
                }
            }          
        })

    })
}


/***************
HTML interaction
****************/

//Turn processing wheel on and off and disable the UI elements while we are processing
function togglePageBusy(blnPageBusy) {
    
    //Set the spinner and disable the page if busy
    if (blnPageBusy) {
        document.getElementById('loader-container').style.display = 'block';
        document.getElementById('previousWeek').onclick = doNothing;
        document.getElementById('nextWeek').onclick = doNothing;
        document.getElementById('closeLink').onclick = doNothing;
        blnInteractive = false;
    }
    else {
        document.getElementById('loader-container').style.display = 'none';
        document.getElementById('previousWeek').onclick = previousWeek;
        document.getElementById('nextWeek').onclick = nextWeek;
        document.getElementById('closeLink').onclick = closeit;
        blnInteractive = true;
    }

}

//Draw our issues group - collapsable table/grid
function drawIssueGroupTable(issueGroup, issueGroupIndex) {
    
    //Array for holding unique classfiications
    var classifications = [];

    //Create our HTML - replace is goofy, only replaces first occurrence lest you /gi 
    issueGroup.name = issueGroup.name.replace(/_JIRAPROJECTKEY_/gi, issueGroup.JiraProjectKey); 
    issueGroup.name = issueGroup.name.replace(/_GOIMAGE_/gi, "<img id='issue-search' src='" + config.orgGoLogo + "' height='33' style='display: inline-block; vertical-align:middle'>");

    var myIssueGroupHTML = issueGroupHTML.replace(/issueGroup.name/gi, issueGroup.name);
    myIssueGroupHTML = myIssueGroupHTML.replace(/issueGroup.key/gi, issueGroup.key);
    myIssueGroupHTML = myIssueGroupHTML.replace(/issueGroup.issues.count/gi, issueGroup.issues.length);

    //Close the expansion of the issue group, if we need to
    if (issueGroup.expandGroup)
        myIssueGroupHTML = myIssueGroupHTML.replace(/<details open/gi, "<details closed");
    else
        myIssueGroupHTML = myIssueGroupHTML.replace(/<details closed/gi, "<details open");   

    //And put the totals message in
    if (totalTotal > 0) {
        //See if we are past our minimums
        var issueGroupPercentage = (100 * issueGroup.timeTotal / totalTotal).toFixed(0);
        if (issueGroupPercentage >= issueGroup.minPercentage) {
            //Hit threshhold, leave it grean
            myIssueGroupHTML = myIssueGroupHTML.replace(/_ISSUEGROUP_TOTALS_MESSAGE_/gi, issueGroup.timeTotal + " hours / " + (100 * issueGroup.timeTotal / totalTotal).toFixed(0) + "%");
        }
        else {
            //Did not hit threshhold, make it red
            myIssueGroupHTML = myIssueGroupHTML.replace(/_ISSUEGROUP_TOTALS_MESSAGE_/gi, '<div style="color:red;">' + issueGroup.timeTotal + " hours / " + (100 * issueGroup.timeTotal / totalTotal).toFixed(0) + "%</div>");
        }
    }
    else
        myIssueGroupHTML = myIssueGroupHTML.replace(/_ISSUEGROUP_TOTALS_MESSAGE_/gi, issueGroup.timeTotal + " hours / " + 0 + "%");

    //Create our container for htis
    var issueGroupDiv = buildHTML('div');
    issueGroupDiv.innerHTML = myIssueGroupHTML;
    document.getElementById('all-issue-groups-container').appendChild(issueGroupDiv);

    //Now go thru each issue for this issue gruup and create a line item for it
    issueGroup.issues.forEach(function(issue, issueIndex) {

        //For all issues, create the table row
        var row = generateIssueRow(issueGroup, issueGroupIndex, issue, issueIndex);

        //And add it to our issue group table
        document.getElementById(issueGroup.key + "-issue-group-table").appendChild(row);

        //Override classification, if we have one
        if (!issue.classification) {
            issue.classification = "No classification defined";
        }
        else {
            if (blnAdmin) {
                if (workgroup.settings.projectOverrides) {
                    if (workgroup.settings.projectOverrides.length > 0) {
                        workgroup.settings.projectOverrides.forEach(function (override) {
                            if (override.fromProject.toUpperCase() == issue.classification.toUpperCase()) {
                                issue.classification = override.toProject;
                                if (override.toSubProject) 
                                    issue.classificationChild = override.toSubProject;
                            }
                        });
                    }    
                }
            }
        }



        //Add classifcation to list, if not already there
        if (classifications.indexOf(issue.classification) >= 0) {
            //skip it
        }
        else {
            classifications.push(issue.classification);
        }

    })

    //Do our classification selection
    if (classifications.length > 1 && issueGroup.classSelect) {
        
        //Setup our selection list
        var classificationSelect = buildHTML('select', null, {
            id: issueGroup.key + "-classification-select"
        });

        //Our first entry will be ALL entries
        var classificationOption = buildHTML('option', "(All " + issueGroup.name + ")", {
        }); 
        classificationSelect.appendChild(classificationOption);

        //Now do the list of our unique classifications for this issues query
        classifications.forEach(function (classification) {
            var classificationOption = buildHTML('option', classification, {
            });
            classificationSelect.appendChild(classificationOption);
        });
        document.getElementById(issueGroup.key + "-classification-selection").appendChild(classificationSelect);

        //And handle when selection changes
        document.getElementById(issueGroup.key + "-classification-select").addEventListener("change", function () { 

            //For keeping track of how many match
            var hitCount = 0;

            //We picked one, so let filter on that value - only enable ones that match select, disable those that dont
            issueGroup.issues.forEach(function (issue) {

                if (document.getElementById(issueGroup.key + "-classification-select").value == "(All " + issueGroup.name + ")" || document.getElementById(issueGroup.key + "-classification-select").value == issue.classification) {
                    document.getElementById(issueGroup.key + "+" + issue.id).style.display =  '';
                    hitCount++;
                    }
                else {
                    document.getElementById(issueGroup.key + "+" + issue.id).style.display =  'none';
                }

                //Update our counts
                if (document.getElementById(issueGroup.key + "-classification-select").value == "(All " + issueGroup.name + ")") {
                    document.getElementById(issueGroup.key + "-issue-group-count").innerHTML = issueGroup.issues.length;
                }
                else {
                    document.getElementById(issueGroup.key + "-issue-group-count").innerHTML = hitCount + " / " + issueGroup.issues.length;
                }

            });
        });
    }   

    //Set open or closed
    document.getElementById(issueGroup.key + "-details").open = issueGroup.expandGroup;

    //Setup listeners to track our collapsing - save for re-use
    document.getElementById(issueGroup.key + "-details").addEventListener("toggle", function () {

        //Setup our storage keys to save the collapse setting for this group
        var expandKeyName = issueGroup.key + "-expand";
        var expandKeyObj = {};
        expandKeyObj[expandKeyName] = document.getElementById(issueGroup.key + "-details").open;
        chrome.storage.local.set(expandKeyObj, function () {
            issueGroup.expandGroup = document.getElementById(issueGroup.key + "-details").open;
        });
    });

    //I think this does nothing - document.getElementById(issueGroup.key + "-details").addEventListener("click", function () { });
    
}

//Create our issue row - part of the issueGroup
function generateIssueRow(issueGroup, issueGroupIndex, issue, issueIndex) {

    /********
    Issue row - define here and add stuff to it
    ********/
    var row = buildHTML('tr', null, {
        id: issueGroup.key + "+" + issue.id,
        class: 'issueRow'
    });

    /************
    Issue summary
    ************/

    //Setup our classification grouping
    setIssueClassification(issue, issueGroup);

    //Setup our remaining estimate
    issue.remainingEstimate = "0";
    if (workgroup.settings.remainingEstimateField) {
        var issueRemainingEstimate = issue.fields[workgroup.settings.remainingEstimateField];
        if (issueRemainingEstimate) {
            issue.remainingEstimate = issueRemainingEstimate / 3600;
        }
    }

    var issueDescription;
    var summaryCell;
        if (issue.fields.summary == issue.fields.summary.toUpperCase()) {
        //All upper case - skip classifiations and make it more pronounced, also skip remaining hours
        issueDescription = "<table><tr><td class='big-summary'>" + issue.fields.summary + "</td></tr></table>"
        summaryCell = buildHTML('td', issueDescription, {  
        });
        issue.remainingEstimate = "";
    }
    else {
        issueDescription = "<table><tr><td class='small-summary'>" + issue.fields.summary + "</td></tr><tr><td class='reporting-group'>" + issue.classification + "<br>" + issue.classificationChild + "</td></tr></table>"
        summaryCell = buildHTML('td', issueDescription, {  
            class: 'truncate'
        });
    }
        
    //Write the Summary cell
    row.appendChild(summaryCell);       

    /*************
     Issue ID cell
    *************/
    var idCell = buildHTML('td', null, {
        class: 'issue-id'
    });

    var idText = document.createTextNode(issue.key);

    /*********************
    Link to the JIRA issue
    *********************/
    var jiraLink = buildHTML('a', null, {
        class: "jira-issue-link"
    });

    jiraLink.addEventListener ("click", function(){ jiraIssuelink(config.orgJiraBaseURI + "/browse/" + issue.key) }); 
    jiraLink.appendChild(idText);
    idCell.appendChild(jiraLink);
    row.appendChild(idCell);

    /*********
    Time input for the 7 Days of the Week
    *********/

    //We have the issue and array goes Saturdy --> Friday
    for (var i = 0; i < 7; i++) {

        //Rip thru each day of the week and grab the worklog object for each

        var timeInputDay = createWorklogCellEntry(issueGroup, issueGroupIndex, issue, issueIndex, issue.worklogDisplayObjects[i], i);

        //Create table cell element for this worklog
        var timeInputDayCell = buildHTML('td');
        timeInputDayCell.appendChild(timeInputDay);

        //Add to the row
        row.appendChild(timeInputDayCell);
    }


    /*********
    Time input TOTAL
    *********/
    var timeInputTotal = buildHTML('text', issue.issueTotalTime, {
        class: 'issue-time-total',
        id: issueGroup.key + "+" + issue.id + "+total"
    });

    timeInputTotal.innerText = issue.issueTotalTime;

    // Total cell
    var timeInputTotalCell = buildHTML('td');
    timeInputTotalCell.appendChild(timeInputTotal);

    //Add total tiem entry to the row
    row.appendChild(timeInputTotalCell);

    //And our remaining estimate column
    var timeRemainingEstimate = createTimeRemainingCellEntry(issueGroup, issueGroupIndex, issue, issueIndex, issue.worklogDisplayObjects[i], i);
    var timeRemainingCell = buildHTML('td');
    timeRemainingCell.appendChild(timeRemainingEstimate);

    //Add remaining estimate to the row
    row.appendChild(timeRemainingCell);

    //And our buffer
    var varBuffer = buildHTML('text', "", {
        innterText: ""
    });
    var bufferCell = buildHTML('td');
    bufferCell.appendChild(varBuffer);
    row.appendChild(bufferCell);

    return row;

}

//Set the issue classification field
function setIssueClassification(inputIssue, inputIssueGroup) {

    //Setup our classification grouping
    inputIssue.classificationChild = "";
    inputIssue.classification = "";
    if (workgroup.settings.customFieldForClassification) {
        var customClassificationField = inputIssue.fields[workgroup.settings.customFieldForClassification];
        if (customClassificationField) {
            inputIssue.classification = customClassificationField.value;
           if (customClassificationField.child) {
                inputIssue.classificationChild = customClassificationField.child.value;
            }
            else {
                inputIssue.classificationChild = "";
            }
        }
        else {
            inputIssue.classification = "No classification defined";
        }
    }
    else {
        inputIssue.classification = "(issues not classified)";
    }

    inputIssue.classification = trim(inputIssue.classification);
    inputIssue.classificationChild = trim(inputIssue.classificationChild);


   //Gotta fix our bogus classification's (for "problemes", there is none) AJH
   if (inputIssue.classification == "No classification defined") {
        if (inputIssue.fields["issuetype"].name == "Problem") { //Hardcoding for now
            inputIssue.classification = "10705 - LandsEnd.com Support";
            inputIssue.classificationChild = "19461 - Problems/Incidents"
            console.log("Alvis Time: Reset the classifiation for " + inputIssue.key + " = " + inputIssue.classification + " - " + inputIssue.classificationChild);
        }
        else if(inputIssue.fields["issuetype"].name == "Test Result" || inputIssue.fields["issuetype"].name == "Sub-task") { 
            //TO DO - HANDLE ASYNC CALL BACK TO UPDATE THIS IN TIME
            //We should handle Test Results as parents classification
            if (inputIssueGroup) {
                setClassificationFromParent(inputIssue.fields["parent"], inputIssue, inputIssueGroup);
                console.log("COMARE WE ARE BACK: " + inputIssue.classification);
            }
            else {
                inputIssue.classification = "No classification defined";
            }
        }
    }
    else if (inputIssue.classificationChild == "Checkout") {
        //Problems with SN and Jira out of sync - checkout is a not a sub-project
        inputIssue.classificationChild = "";
    }
}

//Child does not have classificaiton, so inhereit from paernt AJHAJH
function setClassificationFromParent(inputParent, inputIssue, inputIssueGroup) {

    var blnMatch = false;

    //Grab parent from array and use its classification/child
    //console.log("AJH TRYING TO MATCH: " + inputIssue.key);
    if (inputIssueGroup) {
        for(var issue of inputIssueGroup.issues) {
            console.log("AJH COMPARE: " + inputParent.key + " VS " + issue.key);
            if (inputParent.key == issue.key) {
                console.log("AJH DID MATCH: " + inputParent.key);
                blnMatch = true;
                inputIssue.classification = issue.classification;
                inputIssue.classificationChild = issue.classificationChild;
                updateJiraClassification(inputIssue, issue);
                break;
            }
        }
    }


    if (blnMatch) {
        return;
    }


    //call to get parent and save calss to chlild
    var count = 0;

    gCountOfParentLookupsSent = gCountOfParentLookupsSent + 1;
    console.log("SETTING PARENT SENT TO " + gCountOfParentLookupsSent);

    ///Jira lookup instad    
    JIRA.getIssue(inputParent.id) 
        .then(function(parentIssue) {
            console.log("DOING LOOKUP 4: " + inputParent.id);
            console.log("Got Parent:", JSON.parse(JSON.stringify(parentIssue)));
            //Get issue successfull, lets st calssificaiton object
            if (workgroup.settings.customFieldForClassification) {
                console.log("TR: POS 1");
                var customClassificationField = parentIssue.fields[workgroup.settings.customFieldForClassification];
                if (customClassificationField) {
                    inputIssue.classification = customClassificationField.value;
                    console.log("TR: POS 2: " + inputIssue.classification);
                    if (customClassificationField.child) {
                        console.log("TR: POS 3");
                        inputIssue.classificationChild = customClassificationField.child.value;
                    }
                    else {
                        inputIssue.classificationChild = "";
                    }
                    //how update it in Jira
                    updateJiraClassification(inputIssue, parentIssue);
                }
                else {
                    inputIssue.classification = "No classification defined";
                }
            }
            else {
                inputIssue.classification = "(issues not classified)";
            }
            console.log("DOING LOOKUP 5: " + inputParent.id);
            gCountOfParentLookupsDone = gCountOfParentLookupsDone + 1;
            console.log("SETTING PARENT DONE TO " + gCountOfParentLookupsDone);
        }, function (error) {
            //Get issue failed
            console.log("DOING LOOKUP 6: " + inputParent.id);
            gCountOfParentLookupsDone = gCountOfParentLookupsDone + 1;
            console.log("SETTING PARENT DONE TO " + gCountOfParentLookupsDone);
        });

    //sleep(2000);
    //alert("IS IT DONE: " + blnParentLookupDone);    

 }

 //Send our updated classification back to Jira
function updateJiraClassification(inputIssue, inputParent) {

    var fieldName = workgroup.settings.customFieldForClassification;
    var fieldValue = inputParent.fields[workgroup.settings.customFieldForClassification];

    var updateObject = {
        "fields": {
            [fieldName] : fieldValue
        }
    };

    console.log("WE ARE UPDATING: ", JSON.parse(JSON.stringify(updateObject)));

    console.log("PARENT IS:", JSON.parse(JSON.stringify(inputParent)));

    JIRA.updateClassification(inputIssue.id, updateObject)
        .then(function(data) {
            //Success
            console.log("Alvis Time: Updated Classification - ", JSON.parse(JSON.stringify(data)));
        }, function(error) {
            //Failure
            console.log("Alvis Time: Took error updating classification - ", JSON.parse(JSON.stringify(error)));
        });

}


//Create our issue row - part of the issueGroup
function generateTotalsRow(issueGroups) {

    //Accumulate our sum
    var dailyTotal = [0, 0, 0, 0, 0, 0, 0];
    var rowTotalTotal = 0;
    
    issueGroups.forEach(function(issueGroup) {

        for (var d=0;d<7;d++) {
            if (typeof dailyTotal[d] === 'undefined') {
                dailyTotal[d] = issueGroup.dayTotals[d];
            }
            else {
                dailyTotal[d] = dailyTotal[d] + issueGroup.dayTotals[d];
            }
        }
        rowTotalTotal = rowTotalTotal + issueGroup.timeTotal;

    });

    //We can validate our counters all add up
    if (rowTotalTotal != totalTotal)
        console.log("Alvis Time: We have a validation problem")

    /********
    Totals row - define here and add stuff to it
    ********/
    var row = buildHTML('tr', null, {
        'id': 'totals-issue-id'
    });

    /************
    Empty summary
    ************/
    var summaryCell = buildHTML('td', "", {  
        class: 'totals-title'
    });

    //Write the Summary cell
    row.appendChild(summaryCell);       

    /*************
     Issue ID cell
    *************/
    var idCell = buildHTML('td', "Totals:", {
        class: 'totals-title'
    });

    var idText = document.createTextNode("");
    idCell.appendChild(idText);
    row.appendChild(idCell);         


    /*********
    Time input for the 7 Days of the Week
    *********/

    //We have the issue and array goes Saturdy --> Friday
    for (var i = 0; i < 7; i++) {

        //Rip thru each day of the week

        //Create the html input field for this total
        var timeInputDay = buildHTML('input', "0", {
            class: "day-time-total",
            'id': "total-total+" + i,
            disabled: true
        });                   

        //Make Saturday and Sunday gray
        if (i < 2) {
            timeInputDay.style.backgroundColor = "#D3D3D3";
        }

        //Create table cell element for this worklog
        timeInputDay.value = dailyTotal[i];
        var timeInputDayCell = buildHTML('td');
        timeInputDayCell.appendChild(timeInputDay);

        //Add to the row
        row.appendChild(timeInputDayCell);
    }


    /*********
    Time input TOTAL
    *********/
    
    //Add the final total cell
    if (rowTotalTotal > 0) {
        var timeInputTotal = buildHTML('text', rowTotalTotal, {
            class: 'total-time-total',
            id: "total+total+total"
        });
    }
    else {
        var timeInputTotal = buildHTML('text', "0", {
            class: 'total-time-total',
            id: "total+total+total"
        });           
    }


    //Set the total element to red/green if > 40 yet.
    timeInputTotal.style.color = "white";
    if (rowTotalTotal >= userToRun.minHoursToSubmit)
        timeInputTotal.style.backgroundColor = "green";
    else
        timeInputTotal.style.backgroundColor = "red";        


    // Total cell
    var timeInputTotalCell = buildHTML('td');
    timeInputTotalCell.appendChild(timeInputTotal);

    //Add total tiem entry to the row
    row.appendChild(timeInputTotalCell);
    
    //And our remaining estimate column
    var timeRemainingEstimate = buildHTML('text', "", {
        class: 'total-time-total',
        id: "total+total+remaining"
    });
    var timeRemainingCell = buildHTML('td');
    timeRemainingCell.appendChild(timeRemainingEstimate);
    row.appendChild(timeRemainingCell);

    //And our buffer
    var varBuffer = buildHTML('text', "", {
        innterText: ""
    });
    var bufferCell = buildHTML('td');
    bufferCell.appendChild(varBuffer);
    row.appendChild(bufferCell);

    return row;

}

//Create the worklog cell entry
function createWorklogCellEntry(issueGroup, issueGroupIndex, issue, issueIndex, inputWorklogObject, dayIndex) {
    

    //Create the html input field for this worklog
    var timeInputDay = buildHTML('input', null, {
        class: 'issue-time-input',
        'id': issueGroup.key + "+" + issueGroupIndex + "+" + issue.id + "+" + issueIndex + "+" + dayIndex
    });                

    //Make Saturday and Sunday gray
    if (dayIndex < 2) {
        timeInputDay.style.backgroundColor = "#D3D3D3";
    }

    //Wire up the listener to handle posts when the data changes
    timeInputDay.addEventListener ("change", function(){ postWorklogTimeChange(this)});  

    if (typeof issue.worklogs === 'undefined') {
        timeInputDay.value = 0;
    }
    else {
        //We have right user, right day, drop it in for display
        timeInputDay.value = inputWorklogObject.worklogTimeSpent;

        //Lets take care of the worklog status
        var worklogParts = inputWorklogObject.worklogComment.split("|");
        var worklogUserID = worklogParts[0];
        var worklogEmail = worklogParts[1];
        var worklogStatus = worklogParts[2];                           

        //Make sure its valid
        if (worklogStatus == "entry" || worklogStatus == "submit-for-approval" || worklogStatus == "submitted" || worklogStatus == "approved") {
            //We are good - as long as this is a real card
            if (inputWorklogObject.worklogId != 0) {

                if (!blnTimeCardStatusInitialized) {
                    timecardStatus = worklogStatus;
                    blnTimeCardStatusInitialized = true;
                }
                else if (timecardStatus != "submit-for-approval" && timecardStatus != worklogStatus) {
                    //We have worklogs with mixed statuses..mmmm
                    var messageText = workgroup.messages.mixedStatuses;
                    messageText = messageText.replace(/_ISSUE_/gi, issue.key);
                    messageText = messageText.replace(/_WORKLOG_/gi, inputWorklogObject.worklogId);
                    messageText = messageText.replace(/_STATUS_/gi, worklogStatus);
                    notificationMessage(messageText, "error");
                }
            }
        }
    }

    return timeInputDay;

}

//Create the reamainging estimate cell entry
function createTimeRemainingCellEntry(issueGroup, issueGroupIndex, issue, issueIndex, inputWorklogObject) {
        
    var remainingEstimateInput;    
    //If we have a value, make it editable
        if (issue.remainingEstimate) {
        //Create the html input field for this worklog
        remainingEstimateInput = buildHTML('input', null, {
            class: 'issue-time-input',
            'id': issueGroup.key + "+" + issueGroupIndex + "+" + issue.id + "+" + issueIndex + "+remest"
        });                

        //Wire up the listener to handle posts when the data changes
        remainingEstimateInput.addEventListener ("change", function(){ postRemainingEstimateChange(this, issue)});  

        remainingEstimateInput.value = issue.remainingEstimate;
        }
        else {
            //Create an empty field
        remainingEstimateInput = buildHTML('text', "", {
            class: 'issue-time-input',
            'id': issueGroup.key + "+" + issueGroupIndex + "+" + issue.id + "+" + issueIndex + "+remest"
        });

        }

    return remainingEstimateInput;
}

//Open Jira ticket in a new window
function jiraIssuelink(inputURI) {

    chrome.windows.create ({
        url: inputURI,
        type: "popup"
    });
    //window.open(inputURI);
    return false;
}


//Create our sumation row
function generateTimecardSummaryRow(issueClassification, inputClass, inputType, inputColor, inputSize) {

    //Accumulate our sum
    var dailyTotal = [0, 0, 0, 0, 0, 0, 0];
    var rowTotalTotal = 0;
    var showTotal;
    var descToDisplay;
    var hoursPercentage;
    var imageClass;
    
    /********
    Summary row - define here and add stuff to it
    ********/
    if (inputType == "head") {
        var row = buildHTML('tr', null, {});
    }
    else if (inputType == "fill") {
        if (inputColor.length > 0) {
            var row = buildHTML('tr', null, {
                style: "background: " + inputColor
            });  
        }
        else {
            var row = buildHTML('tr', null, {});  
        }
    }
    else if (inputType == "detail" || inputType == "total" || inputType == "offset-total") {
        var row = buildHTML('tr', null, {
            'id': issueClassification.id + '-summary-id'
        });       
    }
    else { //Offset
        var row = buildHTML('tr', null, {
            'id': issueClassification.id + '-summary-id'
        });        
    }


    /************
    Classifiation summary
    ************/
     if (inputType == "head") {
        if (issueClassification.description.length > 0)
            descToDisplay = issueClassification.description;
        else
            descToDisplay = "(no project)"

        if (issueClassification.description == "No classification defined") {
            var summaryCell = buildHTML('th', descToDisplay, {  
                class: inputClass + '-description',
                style: "text-align:left;color:red"
            });
        }
        else {
            var summaryCell = buildHTML('th', descToDisplay, {  
                class: inputClass + '-description',
                style: "text-align:left"
            });
        }

    }
    else if (inputType == "fill") {
        var summaryCell = buildHTML('td', "", {  
            class: inputClass + '-description',
            style: "height:" + inputSize + "px"
        });       
    }
    else if (inputType == "detail" || inputType == "offset-total") {
        if (issueClassification.descriptionChild.length > 0) //AJH I do not know?
            descToDisplay = issueClassification.descriptionChild;
        else
            descToDisplay = "(no sub-project)"

        var summaryCell = buildHTML('td', descToDisplay, {  
            class: inputClass + '-description'
        });
    }
    else { //Offset
        if (issueClassification.descriptionChild.length > 0) //AJH I do not know?
            descToDisplay = issueClassification.descriptionChild;
        else
            descToDisplay = "(no sub-project)"

        var summaryCell = buildHTML('td', descToDisplay, {  
            class: inputClass + '-description'
        });
    }


    //Write the Summary cell
    row.appendChild(summaryCell);       

    /*********
    Classification totals for the 7 Days of the Week
    *********/

    //We have the issue and array goes Saturdy --> Friday
    for (var i = 0; i < 7; i++) {

        //Rip thru each day of the week

        //Create table cell element for this worklog
        if (inputType == "head") {
            var timeInputDayCell = buildHTML('th', "", {  
                class: inputClass
            });
        }
        else if (inputType == "fill") {
            var timeInputDayCell = buildHTML('td', "", {  
                class: inputClass,

            });        
        }
        else if (inputType == "detail" || inputType == "total") {
            if (issueClassification.dayTotal[i])
                showTotal = issueClassification.dayTotal[i];
            else
                showTotal = "0";

            var timeInputDayCell = buildHTML('td', showTotal, {  
                class: inputClass
            });           
        }
        else if (inputType == "offset-total") {
            if (issueClassification.dayTotal[i])
                showTotal = issueClassification.dayTotal[i];
            else
                showTotal = "0";

            if (showTotal > 0) {
                var timeInputDayCell = buildHTML('td', showTotal, {  
                    class: inputClass + "-offset"
                });    
            }
            else {
                var timeInputDayCell = buildHTML('td', "-", {  
                    class: inputClass
                });                 
            }
       
        }
        else { //Offset
            if (issueClassification.dayTotal[i])
                showTotal = issueClassification.dayTotal[i];
            else
                showTotal = "0";

            if (showTotal > 0) {
                var timeInputDayCell = buildHTML('td', showTotal, {  
                    class: inputClass + "-offset"
                });                   
            }    
            else {
                var timeInputDayCell = buildHTML('td', "-", {  
                    class: inputClass
                });
            }            
         }


        //Make Saturday and Sunday gray

        if (i < 2) {
            if (inputType == "fill") {
                if (inputColor.length <= 0) {
                    timeInputDayCell.style.backgroundColor = "#f3f3f3";
                }
             }
            else {
                timeInputDayCell.style.backgroundColor = "#f3f3f3";
            }
        }

        //Add to the row
        row.appendChild(timeInputDayCell);
    }

    /*********
    Summary Total
    *********/
    hoursPercentage = Number((100 * issueClassification.totalTotal / totalTotal).toFixed(0));

    //Add the final total cell - Here is whwere we could ahve some rules to flag/id things out of or ranges
    if (inputType == "head") {
        var timeInputTotal = buildHTML('th', "", {
            //style: "display: inline-block",
            class: inputClass  
        });
    }
    else if (inputType == "fill") {
        var timeInputTotal = buildHTML('td', "", {
            //style: "display: inline-block",
            class: inputClass  
        });        
    }
    else if (inputType == "detail" || inputType == "total" || inputType == "offset-total") {
        if (issueClassification.totalTotal > 0) {

            if (inputType == "total") {
                var timeInputTotal = buildHTML('td', issueClassification.totalTotal  + " - " + hoursPercentage + "%", {
                    class: inputClass,
                    //style: "display: inline-block",
                    id: issueClassification.id + "+total"
                });               
            }
            else if (inputType == "offset-total") {
                var timeInputTotal = buildHTML('td', issueClassification.totalTotal  + " - " + hoursPercentage + "%", {
                    class: inputClass + "-offset",
                    //style: "display: inline-block",
                    id: issueClassification.id + "+total"
                });
            }
            else {
                if (hoursPercentage < 10) {
                    var timeInputTotal = buildHTML('td', issueClassification.totalTotal  + " - " + hoursPercentage + "%", {
                        class: inputClass,
                        //style: "display: inline-block",
                        id: issueClassification.id + "+total"
                    });
                }
                else {
                    var timeInputTotal = buildHTML('td', issueClassification.totalTotal  + " - " + hoursPercentage + "%", {
                        class: inputClass,
                        //style: "display: inline-block",
                        id: issueClassification.id + "+total"
                        //style: "color:red;"
                    });
                }              
            }
        }
        else {
            var timeInputTotal = buildHTML('td', "0", {
                class: inputClass,
                //style: "display: inline-block",
                id: issueClassification.id + "+total"
            });           
        }
    }
    else { //Offset
        if (issueClassification.totalTotal > 0) {
            if (hoursPercentage < 10) {
                var timeInputTotal = buildHTML('td', issueClassification.totalTotal  + " - " + hoursPercentage + "%", {
                    class: inputClass + "-offset",
                    //style: "display: inline-block",
                    id: issueClassification.id + "+total"
                });
            }
            else {
                var timeInputTotal = buildHTML('td', issueClassification.totalTotal  + " - " + hoursPercentage + "%", {
                    class: inputClass + "-offset",
                    //style: "display: inline-block",
                    id: issueClassification.id + "+total"
                    //style: "color:red;"
                });
            }              
        }
        else {
            var timeInputTotal = buildHTML('td', "-", {
                class: inputClass,
                //style: "display: inline-block",
                id: issueClassification.id + "+total"
            });           
        }
    }

    //Add the column
    row.appendChild(timeInputTotal);

    //And our selection cell
    var postTimeCell = buildHTML('td', "", {
        class: inputClass
    });        

    console.log("TESTING FOR TYPE: " + inputType + " LEGACY POSTION: " + user.legacyPostTime);
    if (inputType == "detail" && user.legacyPostTime) {

        //If no classificaiton, disable the posting
        if (issueClassification.description == "No classification defined") {
            imageClass = "disabled-image";
        }
        else {
            imageClass = "enabled-image";
        }

        if (findClassificationInPostedArray(issueClassification) || issueClassification.description == "No classification defined") {
            var classificationPostTime = buildHTML('img', "", {
                class: imageClass,
                src: "images/red_go_button.png",
                height: "25px",
                id:  issueClassification.id + "+posttime",
                style: "float: right;"
            });
        }
        else {
            var classificationPostTime = buildHTML('img', "", {
                class:imageClass,
                src: "images/go_button.png",
                height: "25px",
                id:  issueClassification.id + "+posttime",
                style: "float: right;"
            });
        }
        //Add checkbox to the cell
        postTimeCell.appendChild(classificationPostTime);

        console.log("AJH WE ARE POSTING TIME");
    }

    //Add the column
    row.appendChild(postTimeCell);

    return row;
}

//Pushed button for this classification entry to post it
function doClassificationPostTime(inputImage, inputClassificationObject) {


    inputImage.src = "images/red_go_button.png";

    inputClassificationObject.legacyPostTime = true;
    postTime(inputClassificationObject);

}

//Find classification in our posted array
function findClassificationInPostedArray(inputClassification) {
    for (i=0;i<postedClassficationArray.length;i++) {
        if (postedClassficationArray[i].description == inputClassification.description && postedClassficationArray[i].descriptionChild == inputClassification.descriptionChild &&
            postedClassficationArray[i].userId == inputClassification.userId && postedClassficationArray[i].weekOf == inputClassification.weekOf) {
            return true;
        }
    }
    return false;
}


/***************
Helper functions 
***************/

//Close the window when "Close Window" clicked
function closeit(){

    window.close();
    return false; //This causes the href to not get invoked
}

//Do nthing....
function doNothing() {
    return false;
}

function doVersionLink(inputObject) {

    document.getElementById('version-message').innerHTML = "The upgrade is downloaded!<br><br>Unzip/extract it into your Alvis Time install location, and you are good to go.";
    document.getElementById('version-link').innerHTML = "";

    //alert("DOING IT: " + chrome.runtime.getURL('popup.js'));
    //chrome.fileSystem.getDisplayPath(Entry entry, function(displayPath) {
    //})

    //window.close();
    return true; //This causes the href to not get invoked
}

//Open the help window
function openHelp(){

    //Initialize the view
    showPageView('help-text'); 
    
    //chrome.windows.create ({
    //   url: config.orgHelpPage,
    //    type: "popup"
    //});
    //window.open(inputURI);
    return false;

    //window.open(config.orgHelpPage, "_help", "scrollbars=no,resizable=no,status=no,location=no,toolbar=no,menubar=no,width=800px,height=600px,left=0,top=0");
    //return false; //This causes the href to not get invoked
}

//Toggle the summary botton
function toggleSummaryButton() {

    if (blnDoUserTimecardSummaryView) {
        blnDoUserTimecardSummaryView = false;
        document.getElementById('summary-info-image').src = "images/summary_button_off.png";
    }
    else {
        blnDoUserTimecardSummaryView = true;
        document.getElementById('summary-info-image').src = "images/summary_button_on.png";
    }

    return false;
}


// Show WOrklog Object
function showWorkLogObject(inputMessage, inputWorklog) {
    console.log("WORK LOG ******************************");
    console.log("WORK LOG " + inputMessage);
    console.log("WORK LOG ISSUE ID:" + inputWorklog.worklogIssueId);
    console.log("WORK LOG WORKLOG ID:" + inputWorklog.worklogId);
    console.log("WORK LOG TIME STARTED:" + inputWorklog.worklogTimeStarted);
    console.log("WORK LOG TIME SPENT:" + inputWorklog.worklogTimeSpent);
    console.log("WORK LOG COMMENT:" + inputWorklog.worklogComment);
    console.log("WORK LOG DAY OF WEEK:" + inputWorklog.worklogDayOfWeek);
    console.log("WORK LOG ******************************");
} 


// isDate function - JS doenst have good date functionality so build it yourself       
function isDate(inputDate) { 

    lDate = new Date(inputDate);
              
    // If the date object is invalid it 
    // will return 'NaN' on getTime()  
    // and NaN is never equal to itself. 
    return inputDate.getTime() === inputDate.getTime(); 

}; 


// html generator
function buildHTML(tag, html, attrs) {

    var element = document.createElement(tag);
    
    // if custom html passed in, append it
    if (html) element.innerHTML = html;

    // set each individual attribute passed in
    for (attr in attrs) {
        if (attrs[attr] === false) continue;
        element.setAttribute(attr, attrs[attr]);
    }

    return element;
}

//showPageView
function showPageView(inputView) {

    document.getElementById('everything').style.display =  'none';
    document.getElementById('orgkeyrequest').style.display =  'none';
    document.getElementById('orgkeysetup').style.display =  'none';
    document.getElementById('timecard-summary').style.display =  'none';
    document.getElementById('help-text').style.display =  'none';
    document.getElementById('welcome-intro').style.display =  'none';
    document.getElementById('version-intro').style.display =  'none';
    document.getElementById('report').style.display =  'none';
    document.getElementById(inputView).style.display =  'block';

}


// Simple Jira api error handling
function genericResponseError(error) {

    var response = error.response || '';
    var status = error.status || '';
    var statusText = error.statusText || '';

    if (response) {
        try {
            notificationMessage(response.errorMessages.join(' '), "error");
        } catch (e) {
            notificationMessage('Error: ' + status + ' - ' + statusText, "error");
        }
    } else {
        notificationMessage('Error: ' + status + ' ' + statusText, "error");
    }

}

// UI error message
function notificationMessage(message, messageType) {
    var notification = document.getElementById('notice')
    notification.innerHTML = message;
    notification.style.display = 'block';
    if (messageType == "error") {
        notification.style.color = "red";    
        orgKeyMessage(message, "error");
    }
    else if (messageType == "notification") {
        notification.style.color = "blue";   
    }
    else {
        notification.style.color = "green";   
    }

}

// Corp Key message
function orgKeyMessage(message, messageType) {
    var notification = document.getElementById('orgKeyMessage')
    notification.innerHTML = message;
    notification.style.display = 'block';
    if (messageType == "error") {
        notification.style.color = "red";    
    }
    else if (messageType == "notification") {
        notification.style.color = "blue";   
    }
    else {
        notification.style.color = "green";   
    }
}

// Date helper to pre-select today's date in the datepicker
Date.prototype.toDateInputValue = (function() {
    var local = new Date(this);
    local.setMinutes(this.getMinutes() - this.getTimezoneOffset());
    return local.toJSON().slice(0, 10);
});

//Converts date to Jira friendly date format
function getStartedTime(dateString) {
    var date = new Date(dateString);
    var time = new Date();
    var tzo = -date.getTimezoneOffset();
    var dif = tzo >= 0 ? '+' : '-';
    var dateConverted = date.getFullYear() 
    + '-' + pad(date.getMonth()+1)
    + '-' + pad(date.getDate())
    + 'T' + pad(time.getHours())
    + ':' + pad(time.getMinutes()) 
    + ':' + pad(time.getSeconds()) 
    + '.' + pad(time.getMilliseconds())
    + dif + pad(tzo / 60) 
    + pad(tzo % 60);
    + "h";
    
    return dateConverted;
}

function pad (num) {
    var norm = Math.abs(Math.floor(num));
    return (norm < 10 ? '0' : '') + norm;
}

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

//Return the date as yyyy-mm-dd
function ISODate(inputDate) {

    inputDate = new Date(inputDate);
    var lYear = inputDate.getFullYear();
    var lMonth = inputDate.getMonth()+1;
    var lDay = inputDate.getDate();
    
    if (lDay < 10) {
        lDay = '0' + lDay;
    }
    if (lMonth < 10) {
        lMonth = '0' + lMonth;
    }
    return (lYear +'-' + lMonth + '-' + lDay);
}

//Why do you have to have your own rounding function? Very lame
function round(value, decimals) {
    return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
}

//Why string trim not native? Very lame
function trim(inputString) {
    var tempString = String(inputString);
    return tempString.trim();
}

// Get Query String parameter
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
};


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

//For loading JSON file remotely - download a file
function getConfig(inputType, inputAction, url, callback) {

    
    try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'json';
        xhr.addEventListener("error", transferFailed);
        xhr.onload = function() {
            var status = xhr.status;
            if (status == 200) {
                //Got it, store it
                //Need to store key and the value, not just URL = 

                var urlObject = {};
                urlObject[inputType] = xhr.response;

                chrome.storage.local.set(urlObject, function () {});
                //And call back
                callback(null, xhr.response);
            } else {
                if (inputAction == "update") {
                    //Attempting to load a new org key and it didnt work, so reject..don't go back to old
                    callback(status);
                }
                else {
                    //Here we try local storage
                    chrome.storage.local.get(inputType, function(response) {
                        if (response) {
                            console.log("Alvis Time: Loading URI from cache: " + url);
                            callback(null, response.keyLocation);
                        }
                        else {
                            //No dice, do error
                            callback(status);
                        }
                    });
                }

            }
        };
        
        xhr.send();       
    }
    catch(err) {
        //Here we try local storage
        chrome.storage.local.get(inputType, function(response) {
            if (response) {
                console.log("Alvis Time: Loading URI from cache: " + url);
                callback(null, response.keyLocation);
            }
            else {
                //No dice, do error
                callback(xhr.status);
            }
        });    
    }

    function transferFailed(evt) {
        console.log("An error occurred while transferring the file.");

        //Here we try local storage
        console.log("POS 5B - TOOK BAD ERROR");
        chrome.storage.local.get(inputType, function(response) {
            if (response) {
                console.log("Alvis Time: Loading URI from cache: " + url);
                callback(null, response.keyLocation);
            }
            else {
                //No dice, do error
                callback(status);
            }
        }); 

    }

};

//Now is time to put is back where we were - user, week, page
function initializeApp() {

    //Grab most recent user, use it if we have one - THIS NEEDS WORK AJH - LOAD USER/DATE/PAGE AT STARTUP
    chrome.storage.local.get("recentUserName", function(data) {
        if (data) {
            if (data["recentUserName"]) {
                recentUserName = data["recentUserName"];
            }
        }
        //Grab most recent week, use it if we have one
        chrome.storage.local.get("recentOffset", function(data2) {
            if (data2) {
                if (data2["recentOffset"]) {
                    recentOffset = data2["recentOffset"];
                }
            }
            //Grab most recent week, use it if we have one              
            chrome.storage.local.get("recentPage", function(data3) {
                if (data3) {
                    if (data3["recentPage"]) {
                        recentPage = data3["recentPage"];
                    }
                }
                //All done, do key and org next    
                loadKeyAndOrg();
            });
        });
    });
}

//Update the column headers to be the right date
function updateDateHeaders() {
    document.getElementById('issue-title-header').innerHTML = dateTitleHeaderSave.replace(/_SAT_/gi, makeMMDD(firstDay));
    document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_SUN_/gi, makeMMDD(addDays(firstDay, 1)));
    document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_MON_/gi, makeMMDD(addDays(firstDay, 2)));
    document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_TUE_/gi, makeMMDD(addDays(firstDay, 3)));
    document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_WED_/gi, makeMMDD(addDays(firstDay, 4)));
    document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_THR_/gi, makeMMDD(addDays(firstDay, 5)));
    document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_FRI_/gi, makeMMDD(lastDay));
}


//Here is the code for doing the post to Service Now
/***************
Posting functions 
***************/
function openLink(inputLink) {

    //Pass to backround for laoding
    chrome.runtime.sendMessage({action: "loadURI", URI: inputLink});
    console.log("LOADING LINK: " + inputLink);
    return false;

}


/***************
Week selection routines
***************/

//Get the range of dates for the week, based on offset
function getWeek(inputOffset) {

    //Get our date objects
    today = new Date();

    if (inputOffset == null || typeof inputOffset === 'undefined' || inputOffset.length <= 0) {
        //If just loaded and today is sun/mon/tues - so default week to LAST week
        if (today.getDay() < userToRun.daysToHangOntoPriorWeek)
            offset = -1;
        else
            offset = 0; 
    }
    else {
        offset = inputOffset;
    }

    firstDay = new Date();
    firstDay.setDate(firstDay.getDate() - dayOfWeekOffset + (offset * 7));
    firstDay.setHours(0, 0, 0, 0); //This sets it to mignight morning of
    
    // .setDate() sets the date (1-31) of the current month.
        // The beginning of the week is:
        //    today's date (firstDay.getDate())
        //    minus the day of week offset to get us back to sunday (dayOfWeekOffset)
        //    plus the number of days we need to offset for future / past weeks (offset * 7) 

    lastDay = new Date(firstDay);
    lastDay.setDate(lastDay.getDate() + 6);
    lastDay.setHours(23,59,59,59); //This gets it to just before midnight, night of the last day is the first day plus 6

    //Build our date range header
    range.innerHTML = workgroup.titles.week + " " + makeDateString(firstDay) + ' - ' + makeDateString(lastDay);

    //If Monday or Tuesday AND week selected is current week Then DO WARNING - make it read
    if (today.getDay() < userToRun.daysToHangOntoPriorWeek && offset == 0) {
        range.innerHTML = "<div style='color:red'>" + workgroup.titles.week + " " + makeDateString(firstDay) + ' - ' + makeDateString(lastDay) + "</div>";
        notificationMessage('WARNING: You may be entering time for the WRONG week.  You may want PRIOR week', "error");
    }
    else {
        notificationMessage(workgroup.messages.intro, "notification");
    }

}
    
//Create nicely formatted date for use
function makeDateString(date) {
    var dd = date.getDate();
    var mm = date.getMonth() + 1;
    var y = date.getFullYear();
    
    var dateString = mm + '/'+ dd + '/'+ y;
    return dateString;
    
}

function makeMMDD(date) {
    var dd = date.getDate();
    var mm = date.getMonth() + 1;
    
    var dateString = mm + '-'+ dd;
    return dateString;      
}

function addDays(inputDate, inputCount) {
    var date = new Date(inputDate);
    date.setDate(date.getDate() + inputCount);
    return date;
}

//Rotate back 1 week
function previousWeek() {

    offset = offset - 1;

    getWeek(offset);
    
    //Store our week for resuse and continue
    if (blnAdmin || blnViewer) {
        chrome.storage.local.set({"recentOffset": offset}, function () {});
        loadWorkgroupTimeCards();
    }
    
    //Changed the week, so reset everything
    updateDateHeaders();
    processIssueGroups("previousweek");

    return false; //This causes the href to not get invoked
}
    
//Rotate forward 1 week
function nextWeek() {

    offset = offset + 1;

    getWeek(offset);

    //Store our week for resuse and continue
    if (blnAdmin || blnViewer) {
        chrome.storage.local.set({"recentOffset": offset}, function () {});
        loadWorkgroupTimeCards();
    }

    //Changed the week, so reset everything
    updateDateHeaders();
    processIssueGroups("nextweek");

    return false; //This causes the href to not get invoked
}

//Send Email
function sendEmail(inputSubject, inputMessage, inputFrom, inputTo) {
    
    var urlEncodedData = "";

     //Send EMail
    if (inputMessage.length > 0) {

        //Replace our tags
        inputSubject = inputSubject.replace("_USERNAME_", userToRun.name);
        inputMessage = inputMessage.replace("_USERNAME_", userToRun.name);

        //Convert to encoded from data for posting
        urlEncodedData = encodeURIComponent(config.orgEmailConfig.emailSubject) + "=" + encodeURIComponent(inputSubject)
        urlEncodedData = urlEncodedData + "&" + encodeURIComponent(config.orgEmailConfig.emailMessage) + "=" + encodeURIComponent(inputMessage)
        urlEncodedData = urlEncodedData + "&" + encodeURIComponent(config.orgEmailConfig.emailFrom) + "=" + encodeURIComponent(inputFrom)
        urlEncodedData = urlEncodedData + "&" + encodeURIComponent(config.orgEmailConfig.emailTo) + "=" + encodeURIComponent(inputTo)

        //URL encode it
        urlEncodedData = urlEncodedData.replace( /%20/g, '+' );

        //Try to send
        try {
            var xhr = new XMLHttpRequest();
            xhr.open(config.orgEmailConfig.emailMethod, config.orgEmailConfig.emailEndpoint, true);
            xhr.setRequestHeader( 'Content-Type', 'application/x-www-form-urlencoded' );
            xhr.responseType = 'text';
            xhr.addEventListener("error", function() {console.log("Alvis Time - Email Failed - " + inputSubject);});
            xhr.onload = function() {
                var status = xhr.status;
                if (status == 200) {
                    //successful
                    console.log("Alvis Time - Email Succeeded - " + inputSubject);
                } 
                else {
                    //Failed
                    console.log("Alvis Time - Email Failed - " + inputSubject);
                }
            };        
            xhr.send(urlEncodedData);       
        }
        catch(err) {
            console.log("Alvis Time - Email Failed - " + inputSubject);
        }
    }

    return;

}

/***************
Utilility - make it good case for reading
***************/
function titleCase(str) {
    return str.replace(
        /\w\S*/g,
        function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}

//Here is the code for doing the post to Service Now
/***************
Posting functions 
***************/
function postTime(inputCLassificationObject) {

    postedClassficationArray.push(inputCLassificationObject);

    //Hold our data on local storage
    chrome.storage.local.set({"postedArray": postedClassficationArray}, function () {
        chrome.storage.local.set({"timeEntry": inputCLassificationObject}, function () {
            console.log("Alvis Time: We are posting  time entry");
            console.log(inputCLassificationObject);
            chrome.runtime.sendMessage({action: "preparepost", timeEntry: inputCLassificationObject});
        });
    });
}


/***************
Screen Shot utility
***************/
function legacyView(blnTakeScreenshot) {

    //Make sure we have legacy ID, else we done
    if (!userToRun.legacyTimeID) {
        alert("No Legacy Time ID - Cant laod this report");
        return false;
    }

    console.log("Alvis Time: Taking screenshot For Legacy ID: " + userToRun.legacyTimeID);

    //Build URL to laod from our pieces
    var URLtoLoad = config.orgLegacyTimeIntegration.legacyTimeReportURI;
    URLtoLoad = URLtoLoad.replace(/_LEGACYUSERID_/, userToRun.legacyTimeID);
    URLtoLoad = URLtoLoad.replace(/_STARTDAY_/, ISODate(firstDay));

    //Create screenshot object to pass along
    var screenshotObject = {
        pageToLoad: URLtoLoad,
        emailAddress: userToRun.email,
        takeScreenshot: blnTakeScreenshot,
        name: userToRun.name,
        date: ISODate(firstDay),
        subject: "Time card for " + ISODate(firstDay),
        body: "Here is time card screenshot for " + userToRun.name + " for week of " + ISODate(firstDay) + "\n\n\n" 
    };

    console.log("Alvis Time: Taking screenshot: " + screenshotObject.pageToLoad);

    //Hold our data on local storage
    chrome.storage.local.set({"screenshotData": screenshotObject}, function () {
        console.log("Alvis Time: We are doing screenshot");
        console.log(screenshotObject);
        chrome.runtime.sendMessage({action: "screenshot", screenshot: screenshotObject});
        console.log("Alvis Time: Sent Screenshot Message");
    });

    return false;

}

//Set UserField defaults
function userDefaults(inputUser) {

    //Set our min hours - if user overirde of workgroup level
    if (typeof inputUser.minHoursToSubmit === 'undefined') {
        inputUser.minHoursToSubmit = workgroup.settings.minHoursToSubmit;
    }
    //Set our max hours - if user overirde of workgroup level
    if (typeof inputUser.maxHoursToSubmit === 'undefined') {
        inputUser.maxHoursToSubmit = workgroup.settings.maxHoursToSubmit;
    }
    //Set our days to wait to see next weeks time
    if (typeof inputUser.daysToHangOntoPriorWeek === 'undefined') {
        inputUser.daysToHangOntoPriorWeek = workgroup.settings.daysToHangOntoPriorWeek;
    }

}



//Useful code for dealing with local storage
// GET: chrome.storage.local.get(function(result){console.log(result)})
// DELETE: chrome.storage.local.clear(function(result){console.log(result)})



