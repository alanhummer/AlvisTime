/****************
This JS is the main processing set - when DOM loaded, code is fired to get, display, process JIRA time entries
****************/ 
var config;  //object that will hold all configuration options
var configForShow; //for showing/managing config befure stuff gets added to it
var workgroup; //easy reference for designated work group
var user;  //easy reference for designated user
var userToRun; //easy refence for who we are running this for
var userIssueGroups = []; //used to store the selected set of issue groups the user has

//Going to manage version, just by putting into code
var version = "2021.05.01.1";
var orgKeyLocation = "https://raw.githubusercontent.com/alanhummer/AlvisTimeOrgKeys/master/";
var orgKeyLocationFile = "";

//Setup for the date selection
var range;
var firstDay; //This will hold the first day of our date range - the full date / time of the day
var lastDay; //This will whold the last day of our date range - the full date / time of the day
var reportFirstDay; //This will hold the first day of our date range - the full date / time of the day - for reports
var reportLastDay; //This will whold the last day of our date range - the full date / time of the day - for reports
var offset = 0;
var today = new Date();
var dayOfWeekOffset = today.getDay() + 1;

//User account stuff from self lookup
var orgKey = "";
var blnAdmin = false; //Easy access to admin boolean
var blnViewer = false; //Easy access to view only deignatin
var blnRemoteConfig = true;
var blnDoProductPerctentages = false;
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
var reportSavedReport;
var saveReportName = "";
var saveReportJQL = "";

//Show user summaries or not
var blnDoUserTimecardSummaryView = false;
var blnParentLookupDone = false;
var gCountOfParentLookupsSent = 0;
var gCountOfParentLookupsDone = 0;

//Configuration and user summary global display items
var gConfigFieldRow = "";
var gConfigDetailsDropDown = "";
var gConfigSummary = "";
var gChangeHandlers = [];
var gConfigChanged = false;
var gConfigChangedThisSession = false;
var gUserFields = "";
var gUserCapacities = "";
var gUserCapacityDate = "";

//For testing infiniate loop
var totalDumps = 0;

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
    document.getElementById("close-image-orgkeysetup").addEventListener ("click", function(){ closeit()}); 
    document.getElementById("help-image-orgkeysetup").addEventListener ("click", function(){ openHelp()}); 
    document.getElementById("submit-orgkeysetup").addEventListener ("click", function(){alert("Not done with this yet. Sorry.")}); 
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

                            var configURL = orgKeyLocation + data.orgKeya + "-" + encodeURIComponent(version) + ".json";

                            getConfig("keyLocation", "get", false, configURL,  function(err, response) {
                
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
                                    if (response) {
                                        if (response.orgKeyURI) {
                                            console.log("Alvis Time: We have an org key location at:" + response.orgKeyURI);
                                            //OK, lets get the Org Key configuraiton from its location
                                            orgKeyLocationFile = response.orgKeyURI;
                                            getConfig("keyStorage", "get", false, response.orgKeyURI,  function(keyErr, keyResponse) {
                                                //See if it worked
                                                if (keyErr != null) {
                                                    //BOGUS - HERE IS WHERE WHERE WE GRAB FROM LOCAL STORAGE
                                                    console.log("Alvis Time: Get OrgKeyURI error: ", JSON.parse(JSON.stringify(keyErr)));
                                                    orgKeyMessage("We have a valid organization key, but you do not have access to it.  <br><br>Check your network or Jira signin and access, and try again.<BR><BR>Or try a different organization key or contact your administrator.", "error")
                                                    getNewOrgKey(data.orgKeya, "true");
                                                }
                                                else {
                                                    if (!keyResponse) {
                                                        //BOGUS - HERE IS WHERE WHERE WE GRAB FROM LOCAL STORAGE
                                                        console.log("Alvis Time: Get OrgKeyURI error: ", JSON.parse(JSON.stringify(keyErr)));
                                                        orgKeyMessage("We have a valid organization key, but you do not have access to it.  <br><br>Check your network or Jira signin and access, and try again.<BR><BR>Or try a different organization key or contact your administrator.", "error")
                                                        getNewOrgKey(data.orgKeya, "true");
                                                    }
                                                    else {
    
                                                        //All good, lets do this
                                                        orgKey = data.orgKeya;
                                                        config = keyResponse;
    
                                                        configForShow = JSON.parse(JSON.stringify(config));
    
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
                                                }                                            
                                            });
                                        }
                                        else {
                                            //Bogus - start over
                                            console.log("Alvis Time: We have gotten an org key location but it FAILS to have orgKeyURI:", JSON.parse(JSON.stringify(response)));
                                            orgKeyMessage("Could not retrieve organization key at this time. Please check your key and try again or try back later.", "error")
                                            getNewOrgKey(data.orgKeya, "true");
                                        }
                                    }
                                    else {
                                        console.log("Alvis Time: We have gotten an org key location but it having trouble. Please try again.");
                                        orgKeyMessage("Could not retrieve organization key at this time. Please check your key and try again or try back later.", "error")
                                        getNewOrgKey(data.orgKeya, "true");

                                    }
                                }
                            });
                        }
                        else {
                            //recent addition, put the orgkeys under the OrgKeys directory
                            loadConfig("OrgKeys/" + data.orgKeya + ".json", function(response) { 
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
                                    configForShow = JSON.parse(JSON.stringify(config));
                                    
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
            var configURL = orgKeyLocation + document.getElementById("orgkey").value + "-" + encodeURIComponent(version) + ".json";
            getConfig("keyLocation", "update", true, configURL,  function(err, response) {
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
                    //All good - flush storage
                    chrome.storage.local.clear(function(result){console.log("Alvis Time: New Org Key - Flushed Storage:" + result)});
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
    var projectTotal = 0;
    var row;

    //Algorithm is:
    //1) Combine all the non-caculated issues together - to figure out project allocation set
    //2) Calculate from that set based on %, and load it up for the missing entries
    //3) Start fresh then in showing the breakdowns - clssification array accumulate for each issue
    //4) Clean it up, sort it
    //5) Figure out offsets

    //AJH #5 - Start with a fresh for testing
    console.log("DEBUG: Started with this posted array", postedClassficationArray);
    //chrome.storage.local.remove("postedArray", function() {
    //    postedClassficationArray = [];
    //    console.log("DEBUG: Started with this posted array", postedClassficationArray);
    //});

    //Save our page laoded
    if (blnAdmin) {
        chrome.storage.local.set({"recentPage": "timecard-summary"}, function () {});  
        recentPage = "timecard-summary";      
    }

    //If user has priveldge (not input user)
    if (user.legacyScreenShot) {
        if (typeof userToRun.legacyTimeID  === 'undefined') {
            document.getElementById('screenshotlink-summary').style.display =  'none';
        }
        else {
            document.getElementById('screenshotlink-summary').style.display =  '';
        }
    }
    else {
        document.getElementById('screenshotlink-summary').style.display =  'none';
    }

    //If user has priveldge (not input user)
    if (user.legacyViewCard) {
        if (typeof userToRun.legacyTimeID  === 'undefined') {
            document.getElementById('viewcard-summary').style.display =  'none';
            document.getElementById('posttimes-summary').style.display =  'none';
            document.getElementById('viewcard-approved-summary').style.display =  'none';
        }
        else {
            document.getElementById('viewcard-summary').style.display =  '';
            document.getElementById('posttimes-summary').style.display =  '';
            document.getElementById('viewcard-approved-summary').style.display =  '';
        }
    }
    else {
        document.getElementById('viewcard-summary').style.display =  'none';
        document.getElementById('posttimes-summary').style.display =  'none';
        document.getElementById('viewcard-approved-summary').style.display =  'none';
    }

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
        "totalTotal": 0,
        "parentClassTotal": 0,
        "capacity": 0
    }


    //Combine all the non-caculated issues together - to figure out project allocation set
    //If we have a caculation override, figure out the override
    if (!workgroup.settings.classificationToCalculate) {
        //Skip all this mess
    }
    else {
        //Get the main or most used classification
        userIssueGroups.forEach(function(issueGroup) {
            //Only if it is a project do we care
            if (issueGroup.isProject) {
                issueGroup.issues.forEach(function(issue) {
                                    
                    //Let set our classifiation/childClassification if we need to
                    issueLoadClassificationChild(issue);

                    if (issue.classification.toUpperCase() == workgroup.settings.classificationToCalculate.toUpperCase()) {
                        //Skip what we are trying to override
                    }
                    else {

                        //See if we cna find our classification already
                        var classificationObject;
                        classificationArray.forEach(function(classObj) {
                            if (classObj.description.toUpperCase() == issue.classification.toUpperCase()) {
                                //Found one - done
                                classificationObject = classObj;
                            }
                        }) 

                        //If not, create a new object
                        if (!classificationObject) {

                            //Add hours to classification holdking   
                            classificationObject = {
                                "id": classificationID,
                                "userId": userToRun.userid,
                                "legacyPostTime": false, //What is this?
                                "weekOf": ISODate(firstDay),
                                "description": issue.classification,
                                "descriptionChild": issue.classificationChild,
                                "dayTotal": [0, 0, 0, 0, 0, 0, 0],
                                "totalTotal": 0,
                                "parentClassTotal": 0,
                                "dayPostedTotal": [0, 0, 0, 0, 0, 0, 0], //For offset hours
                                "postedTotal": 0, //For offset hours
                                "timePriority": issueGroup.timePriority //Initially, match issueGroup time priority.  May have addtl definitions by project at some point - thos would go here
                            }

                            //Get Override of Classifcation Child if we have one to
                            // - Not needed loadClassificationChild(classificationObject);

                            loadCapacity(classificationObject);
                            classificationArray.push(classificationObject); //AJHPOST

                        }

                        //Add up the total
                        classificationObject.totalTotal = classificationObject.totalTotal + issue.issueTotalTime;
                        classificationObject.parentClassTotal = classificationObject.parentClassTotal + issue.issueTotalTime;
                        projectTotal = projectTotal + issue.issueTotalTime;
                        
                    }
                })
            }
        });

        //See if we cna find our classification already
        var saveTotal = 0;
        var saveClassObj;
        classificationArray.forEach(function(classObj) {
           classObj.projectPercentage = classObj.totalTotal / projectTotal;
            if (classObj.totalTotal >= saveTotal) {
                saveClassObj = classObj;
                saveTotal = classObj.totalTotal;
            }
        })   

        //See if we cna find our classification already - here is where we calculate the from the calculation set
        userIssueGroups.forEach(function(issueGroup) {
            issueGroup.issues.forEach(function(issue) {
                if (issue.classification.toUpperCase() == workgroup.settings.classificationToCalculate.toUpperCase()) {

                    //See if user has an override
                    if (issue.fields.summary.toUpperCase() == "002 - ENVIRONMENT / STACK DEPLOYS / ISSUES" || issue.classification.toUpperCase() == "004 - COMPUTER / SIGNIN / SECURITY / APP ISSUES") {
                        issue.classification = "10705 - LandsEnd.com Support";
                        issue.classificationChild = "19461 - Problems/Incidents";
                    }
                    else {
                        if (issue.fields.summary.toUpperCase() == "001 - LECOM DEPLOYMENT" && userToRun.defaultDeployClassification) {
                            issue.classification = userToRun.defaultDeployClassification;
                        }
                        else {
                            if (userToRun.defaultClassification) {
                                //Use this one
                                issue.classification = userToRun.defaultClassification;
                            }
                            else {
    
                                //Assigne to the biggest of our projects from the save list
                                issue.classification = saveClassObj.description;
    
                                //AJH SOMEWHERE HERE IS WHERE WE SPLIT BY % classObj.projectPercentage - multiple time classes for one issue
                                if (blnDoProductPerctentages) {
    
                                    if (!issue.classificationArray) {
                                        issue.classificationArray = [];
                                    }
    
                                    //Add dlassification objects for this match
                                    classificationArray.forEach(function(classObj) {
                                        if (classObj.totalTotal > 0) {
                                            issue.classificationArray.push(classObj);
                                            console.log("Alvis Time Project Percentage: Overriding issue '" + issue.fields.summary + "' classifiction of '" + workgroup.settings.classificationToCalculate + "' with caluclated value '" + classObj.projectPercentage + "' for " + issue.issueTotalTime + " hours");
                                        }
                                    })  
                                }
                            }
                        }
                    }
                }
            })
        });
    }
 
    //Re-initialize this
    classificationArray = [];

    //For each issue, if > 0 hours, add hours for each day to classificationObject set for each day - incl total
    userIssueGroups.forEach(function(issueGroup) {
        issueGroup.issues.forEach(function(issue) {
            if (issue.issueTotalTime > 0) {

                //Let set our classifiation/childClassification if we need to
                issueLoadClassificationChild(issue);

                //Our classification display
                classificationDisplay = "";

                var classificationObject;

                //See if we cna find our classification already
                classificationArray.forEach(function(classObj) {
                    if (classObj.description.toUpperCase() == issue.classification.toUpperCase() && classObj.descriptionChild.toUpperCase() == issue.classificationChild.toUpperCase()) {
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
                        "parentClassTotal": 0,
                        "dayPostedTotal": [0, 0, 0, 0, 0, 0, 0], //For offset hours
                        "postedTotal": 0, //For offset hours
                        "timePriority": issueGroup.timePriority //Initially, match issueGroup time priority.  May have addtl definitions by project at some point - thos would go here
                    }
                    //Get Override of Classifcation Child if we have one to
                    // - Not needed loadClassificationChild(classificationObject);

                    loadCapacity(classificationObject);
                    classificationArray.push(classificationObject); //AJHPOST

                }

                //And our issue classifiaiton array too
                if (issue.classificationArray && blnDoProductPerctentages) {
                    var blnFoundIssueClass = false;
                    issue.classificationArray.forEach(function(issueClassObj) {
                        classificationArray.forEach(function(classObj) {
                            if (classObj.description == issueClassObj.description) {
                                //Found one - done
                                blnFoundIssueClass = true;
                            }
                        })                       

                        if (!blnFoundIssueClass) {
                        
                            //A key for the classifications
                            classificationID = classificationID + 1;
    
                            classificationObject = {
                                "id": classificationID,
                                "userId": userToRun.userid,
                                "legacyPostTime": false, //What is this?
                                "weekOf": ISODate(firstDay),
                                "description": issueClassObj.description,
                                "descriptionChild": issueClassObj.descriptionChild,
                                "dayTotal": [0, 0, 0, 0, 0, 0, 0],
                                "totalTotal": 0,
                                "parentClassTotal": 0,
                                "dayPostedTotal": [0, 0, 0, 0, 0, 0, 0], //For offset hours
                                "postedTotal": 0, //For offset hours
                                "timePriority": issueGroup.timePriority //Initially, match issueGroup time priority.  May have addtl definitions by project at some point - thos would go here
                            }
                            loadCapacity(classificationObject);

                            //Now add the object to the array
                            classificationArray.push(classificationObject); //AJHPOST
                           
                            console.log("Alvis Time: We added class from array - ", JSON.parse(JSON.stringify(classificationObject)));

                        }

                    });
                }

                


                //We have our % set per classification based on # hours per
                //We have put those class objects into issue object as array
                //We have added all class objest to the class array we are process
                //Now, just do the match for each entry total * %, and get them in the right buckets
                //Not bad...but they don't quite add up yet

                //For each day, add the amounts to the totals for the classification
                for (var dayIndex=0; dayIndex < 7; dayIndex++) {
                    if (issue.worklogDisplayObjects[dayIndex].worklogTimeSpent > 0) {
                        if (issue.classificationArray && blnDoProductPerctentages) {
                            issue.classificationArray.forEach(function(issueClassObj) {
                                classificationArray.forEach(function(classObj) {
                                    if (classObj.description == issueClassObj.description) {
                                        //Found one - do the math and add tot the total
                                        var issueAmountToAdd = issue.worklogDisplayObjects[dayIndex].worklogTimeSpent * issueClassObj.projectPercentage;
                                        classObj.dayTotal[dayIndex] =  classObj.dayTotal[dayIndex] + issueAmountToAdd;
                                        classificationTotalsObject.dayTotal[dayIndex] =  classificationTotalsObject.dayTotal[dayIndex] + issueAmountToAdd;
                                        classificationObject.totalTotal = classificationObject.totalTotal + issue.issueAmountToAdd;
                                     }
                                })                       
                            });
                        }
                        else {
                            classificationObject.dayTotal[dayIndex] =  classificationObject.dayTotal[dayIndex] + issue.worklogDisplayObjects[dayIndex].worklogTimeSpent;
                            classificationTotalsObject.dayTotal[dayIndex] =  classificationTotalsObject.dayTotal[dayIndex] + issue.worklogDisplayObjects[dayIndex].worklogTimeSpent;

                        }
                    }
                }

                //For double checking totals
                classificationObject.totalTotal = classificationObject.totalTotal + issue.issueTotalTime;
                classificationTotalsObject.totalTotal = classificationTotalsObject.totalTotal + issue.issueTotalTime;

            }
        
            //Match on parent and add them up
            classificationArray.forEach(function(classObj) {
                if (classObj.description == issue.classification) {
                    //Found one - add to it
                    classObj.parentClassTotal = classObj.parentClassTotal + issue.issueTotalTime;
                }
            }) 
        
        })

    })

    //We have our calculted entries loaded - start fresh
    debugShowClassifications();

    //We have done all the muckety muck, result may have duplicates...let fix em
    classificationArray = consolidateDuplicateEntries(classificationArray);

    //Let's sort our array of classification objects by timePriority
    classificationArray = classificationArray.sort(timePriorityCompare);
 
    //Setup starter object
    var prevClassificationObject = {
        "id": 0,
        "description": "(not defined)",
        "descriptionChild": "(not defined)",
        "dayTotal": [0, 0, 0, 0, 0, 0, 0],
        "totalTotal": 0,
        "parentClassTotal": 0,
        "timePriority": 0,
        "capacity": 0
    }

    //Setup our offset totals object
    var classificationTotalsOffsetObject = {
        "id": -1,
        "description": "OFFSET:",
        "descriptionChild": "OFFSET:",
        "dayTotal": [0, 0, 0, 0, 0, 0, 0],
        "totalTotal": 0,
        "parentClassTotal": 0,
        "timePriority": 0,
        "capacity": 0
    }
    
    //Make a copy of our totals for use in offset methods
    var classificationTotalsNetObject = {
        "id": -1,
        "description": "NET TOTALS:",
        "descriptionChild": "NET TOTALS:",
        "dayTotal": [classificationTotalsObject.dayTotal[0], classificationTotalsObject.dayTotal[1], classificationTotalsObject.dayTotal[2], classificationTotalsObject.dayTotal[3], classificationTotalsObject.dayTotal[4], classificationTotalsObject.dayTotal[5], classificationTotalsObject.dayTotal[6]],
        "totalTotal": classificationTotalsObject.totalTotal,
        "parentClassTotal": 0,
        "capacity": 0
    }

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
                classificationObject.postedTotal = Number(classificationObject.postedTotal + classificationObject.dayPostedTotal[dayIndex]);
                hoursToDrawDown = hoursToDrawDown - classificationObject.dayPostedTotal[dayIndex];
            }
        });
    //}

    var blnDidAllClassifications = true;
    //For each classification object, if hours > 0 show it to the grid AND we set posted time based on priority, show it here as second line
    classificationArray.forEach(function(classificationObject) {

        //See if this is mucked:
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
                "parentClassTotal": 0,
                "timePriority": classificationObject.timePriority, //Initially, match issueGroup time priority.  May have addtl definitions by project at some point - thos would go here
                "capacity": 0
            }

            //Now do an offset

            //For each day, add the amounts to the totals for the classification
            for (var dayIndex=0; dayIndex < 7; dayIndex++) {
                offsetObject.dayTotal[dayIndex] = classificationObject.dayTotal[dayIndex] - classificationObject.dayPostedTotal[dayIndex];
                offsetObject.totalTotal = offsetObject.totalTotal + offsetObject.dayTotal[dayIndex];

                //Fill in our offset totals object
                classificationTotalsOffsetObject.dayTotal[dayIndex] = classificationTotalsOffsetObject.dayTotal[dayIndex] + offsetObject.dayTotal[dayIndex];
                classificationTotalsOffsetObject.totalTotal = classificationTotalsOffsetObject.totalTotal + offsetObject.dayTotal[dayIndex];                 
                
                //Fill in our offset net object
                classificationTotalsNetObject.dayTotal[dayIndex] = classificationTotalsNetObject.dayTotal[dayIndex] - offsetObject.dayTotal[dayIndex];
                classificationTotalsNetObject.totalTotal = classificationTotalsNetObject.totalTotal - offsetObject.dayTotal[dayIndex];

            }

            //Now have to create the offset row
            row = generateTimecardSummaryRow(offsetObject, "timecard-summary-class", "offset");

            //And add it to our issue group table
            document.getElementById("timecard-summary-details").appendChild(row);  

        }

        //Reset our previous object
        prevClassificationObject = classificationObject;

        //Assess if we are done
        if (findClassificationInPostedArray(classificationObject)) {
            //Found it - maybe done?
        }
        else {
            //did not found it...not done
            blnDidAllClassifications = false;
        }

    })

    if (blnDidAllClassifications) 
        document.getElementById("post-all-summary").src = "images/red_go_button.png";

    //Post times to legacy system
    document.getElementById("post-all-summary").addEventListener ("click", function(){ doAddToClassificationPostTimes(this, classificationArray)}); 

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
debugShowClassifications
****************/
function debugShowClassifications() {
    userIssueGroups.forEach(function(issueGroup) {
        issueGroup.issues.forEach(function(issue) {
            console.log("AJH DEBUG ISSUE: " + issue.fields.summary + " = " + issue.classification + "-->" + issue.classificationChild);
        });
    });
}


/****************
Show Report
****************/
function showReport(inputReportObject) {

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
   
    if (gCountOfParentLookupsSent > gCountOfParentLookupsDone) {
        setTimeout(function () { showReportLines(inputReportObject); }, 3000);
    }
    else {
        //let's do this
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
    var classEstimateTotal = 0;
    var classRemEstimateTotal = 0;
    var classTotalTotal = 0;
    var totalWeekTotal = 0;
    var totalEstimateTotal = 0;
    var totalRemEstimateTotal = 0;
    var totalTotalTotal = 0;
    var saveClassification = "";
    var saveShade = "report-shade-1";
    var blnShowIt = false;
    var calculatedTotalHours = 0;
    var hoursPercent;

    inputReportObject.issues = inputReportObject.issues.sort(classificationCompare);

    //Accumulate our hour totals to use as %
    inputReportObject.issues.forEach(function (issue) {
        if (issue.worklogs) {
            issue.worklogs.forEach(function(worklog) {
                if (inputReportObject.report.blnAllUsers) {
                    calculatedTotalHours = calculatedTotalHours + (worklog.timeSpentSeconds / 3600);
                }
                else {
                    if (typeof worklog.comment != "undefined") {
                        if (worklog.comment.includes(userToRun.userid + "|")) {
                            calculatedTotalHours = calculatedTotalHours + (worklog.timeSpentSeconds / 3600);
                        }
                    }
                }
            });
        }
    });

    //Create our rows
    inputReportObject.issues.forEach(function (issue) {

        //Go thru the worklogs and add em up
        if (issue.worklogs) {
            issue.worklogs.forEach(function(worklog) {

                //Only if we care AHH
                blnShowIt = false;
             
                if (inputReportObject.report.blnAllUsers) {
                    blnShowIt = true;
                }
                else {
                    if (typeof worklog.comment != "undefined") {
                        if (worklog.comment.includes(userToRun.userid + "|")) {
                            blnShowIt = true;
                        }
                        else {
                            blnShowIt = false;
                        }
                    }
                    else {
                        blnShowIt = false;
                    }
                }
    
                if (blnShowIt) {
    
                    //Now lets process our worklog - filter date range and user id from comments
                    var worklogDate = new Date(worklog.started);
    
                    //Now convert to CT for compare
                    if (worklogDate.getTimezoneOffset() == 300 || worklogDate.getTimezoneOffset() == 360) {
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
    
                }
    
            });

        }


        if (issue.classification != saveClassification) {

            if (saveClassification != "") {
                //Show the prior totals
                var classificationObject = {
                    "id": 0,
                    "userId": userToRun.userid,
                    "legacyPostTime": false, //What is this?
                    "weekOf": ISODate(firstDay),
                    "description": saveClassification,
                    "descriptionChild": "",
                    "dayTotal": dayOfWeekClassification,
                    "totalTotal": 0,
                    "parentClassTotal": 0,
                    "dayPostedTotal": [0, 0, 0, 0, 0, 0, 0], //For offset hours
                    "postedTotal": 0, //For offset hours
                    "timePriority": 0 //Initially, match issueGroup time priority.  May have addtl definitions by project at some point - thos would go here
                }

                loadCapacity(classificationObject);

                //Classification Row - total from prior
                hoursPercent = (weekTotalClassification / calculatedTotalHours) * 100;
                myOutputRow = document.getElementById('report-total').innerHTML;
                myOutputRow = myOutputRow.replace(/report-summary/gi, "report-title"); 
                myOutputRow = myOutputRow.replace(/report-shade-entry/gi, saveShade); 
                myOutputRow = myOutputRow.replace(/_REPORTISSUE_/gi, "<font color='red'>TOTAL: " + Math.round(hoursPercent) + "%</font>"); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY0_/gi, dayOfWeekClassification[0]); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY1_/gi, dayOfWeekClassification[1]); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY2_/gi, dayOfWeekClassification[2]); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY3_/gi, dayOfWeekClassification[3]); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY4_/gi, dayOfWeekClassification[4]); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY5_/gi, dayOfWeekClassification[5]); 
                myOutputRow = myOutputRow.replace(/_REPORTDAY6_/gi, dayOfWeekClassification[6]); 
                myOutputRow = myOutputRow.replace(/_REPORTWEEKTOTAL_/gi, "<font color='red'>" + weekTotalClassification + "</font>"); 
                myOutputRow = myOutputRow.replace(/_REPORTESTIMATE_/gi, "<font color='red'>" + classEstimateTotal + "</font>"); 
                myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, "<font color='red'>" + classRemEstimateTotal + "%</font>"); 
                myOutputRow = myOutputRow.replace(/_REPORTTOTALTOTAL_/gi, "<font color='red'>" + classTotalTotal + "</font>"); 
 
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
            classEstimateTotal = 0;
            classRemEstimateTotal = 0;
            classTotalTotal = 0;

            //Classification Row
            myOutputRow = document.getElementById('report-header-row').innerHTML;
            myOutputRow = myOutputRow.replace(/report-summary/gi, "report-title"); 
            myOutputRow = myOutputRow.replace(/report-shade-entry/gi, saveShade); 
            myOutputRow = myOutputRow.replace(/_REPORTISSUE_/gi, saveClassification.toUpperCase()); 


            //Add it to the rest
            myOutputRows = myOutputRows + myOutputRow;

        }

        //We switched classificaiton and reset, so now add new amount in
        for(var u=0;u<dayOfWeekClassification.length;u++) {
            dayOfWeekClassification[u] = dayOfWeekClassification[u] + dayOfWeek[u];
        }
        weekTotalClassification = weekTotalClassification + weekTotal;
        
        //Build our row
        myOutputRow = document.getElementById('report-row').innerHTML;
        myOutputRow = myOutputRow.replace(/report-shade-entry/gi, saveShade); 

        issue.isDone = false;
        if(issue.fields.status.name) {
            console.log("STATUS: " + issue.fields.status.name);
            switch(issue.fields.status.name.toUpperCase()) {
                case "DELIVERED":
                case "RESOLVED":
                case "BANKED":
                case "CLOSED":
                case "DONE":
                case "Q:RELEASE":
                    issue.isDone = true;
                    myOutputRow = myOutputRow.replace(/_REPORTISSUECOLOR_/gi, "black");
                    break;
                default:        
                    //issue is Resolved	
                    myOutputRow = myOutputRow.replace(/_REPORTISSUECOLOR_/gi, "blue"); 		
                    break;
            }             	
        } 
        else {
            //issue is Resolved	
            myOutputRow = myOutputRow.replace(/_REPORTISSUECOLOR_/gi, "green"); 				
        }


        myOutputRow = myOutputRow.replace(/_REPORTISSUE_/gi, issue.key + " - " + titleCase(issue.fields.summary)); 
        
        var myLink = config.orgSettings.jiraBaseURI + "/browse/" + issue.key;
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
        if (issue.isDone) {
            if (issue.fields.timeestimate) 
                myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, 0); 
            else
                myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, "-"); 
        }

        if (issue.fields.timeoriginalestimate) {
            if (issue.fields.timeoriginalestimate == 0 && issue.fields.timeestimate == 0) {
                myOutputRow = myOutputRow.replace(/_REPORTESTIMATE_/gi, "-"); 
                myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, "-");  
            }
            else {

                classEstimateTotal = classEstimateTotal + (issue.fields.timeoriginalestimate/3600);
                totalEstimateTotal = totalEstimateTotal + (issue.fields.timeoriginalestimate/3600);
                classRemEstimateTotal = classRemEstimateTotal + (issue.fields.timeestimate/3600);
                totalRemEstimateTotal = totalRemEstimateTotal + (issue.fields.timeestimate/3600);

                myOutputRow = myOutputRow.replace(/_REPORTESTIMATE_/gi, issue.fields.timeoriginalestimate/3600); 
                myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, issue.fields.timeestimate/3600); 

                //Red if over, else maybe green
                if (issue.isDone) {
                    if (issue.fields.timespent > issue.fields.timeoriginalestimate) {        
                        myOutputRow = myOutputRow.replace(/report-total-black-red-line/gi, "report-total-red-line"); 
                    }
                    else {
                        myOutputRow = myOutputRow.replace(/report-total-black-red-line/gi, "report-total-green-line");                         
                    }
                }
                else {
                    if (issue.fields.timespent > issue.fields.timeoriginalestimate) {        
                        myOutputRow = myOutputRow.replace(/report-total-black-red-line/gi, "report-total-red-line"); 
                    }
                    else {
                        myOutputRow = myOutputRow.replace(/report-total-black-red-line/gi, "report-total-black-line");                         
                    }                   
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
        classTotalTotal = classTotalTotal + (issue.fields.timespent/3600);   
        totalTotalTotal = totalTotalTotal + (issue.fields.timespent/3600);   

        //Add it to the rest
        myOutputRows = myOutputRows + myOutputRow;

        dayOfWeek = [0, 0, 0, 0, 0, 0, 0];
        weekTotal = 0;
   
    });

    //Show the prior totals
    var classificationObject = {
        "id": 0,
        "userId": userToRun.userid,
        "legacyPostTime": false, //What is this?
        "weekOf": ISODate(firstDay),
        "description": saveClassification,
        "descriptionChild": "",
        "dayTotal": dayOfWeekClassification,
        "totalTotal": 0,
        "parentClassTotal": 0,
        "dayPostedTotal": [0, 0, 0, 0, 0, 0, 0], //For offset hours
        "postedTotal": 0, //For offset hours
        "timePriority": 0 //Initially, match issueGroup time priority.  May have addtl definitions by project at some point - thos would go here
    }

    loadCapacity(classificationObject);


    //Final classification total
    hoursPercent = (weekTotalClassification / calculatedTotalHours) * 100;
    myOutputRow = document.getElementById('report-total').innerHTML;
    myOutputRow = myOutputRow.replace(/report-summary/gi, "report-title"); 
    myOutputRow = myOutputRow.replace(/report-shade-entry/gi, saveShade); 
    myOutputRow = myOutputRow.replace(/_REPORTISSUE_/gi, "<font color='red'>TOTAL: " + Math.round(hoursPercent) + "%</font>"); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY0_/gi, dayOfWeekClassification[0]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY1_/gi, dayOfWeekClassification[1]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY2_/gi, dayOfWeekClassification[2]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY3_/gi, dayOfWeekClassification[3]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY4_/gi, dayOfWeekClassification[4]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY5_/gi, dayOfWeekClassification[5]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY6_/gi, dayOfWeekClassification[6]); 
    myOutputRow = myOutputRow.replace(/_REPORTWEEKTOTAL_/gi, "<font color='red'>" + weekTotalClassification + "</font>"); 
    myOutputRow = myOutputRow.replace(/_REPORTESTIMATE_/gi, "<font color='red'>" + classEstimateTotal + "</font>"); 
    myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, "<font color='red'>" + classRemEstimateTotal + "%</font>"); 
    myOutputRow = myOutputRow.replace(/_REPORTTOTALTOTAL_/gi, "<font color='red'>" + classTotalTotal + "</font>"); 


    //Add it to the rest
    myOutputRows = myOutputRows + myOutputRow;

    //And finally our TOTAL total row
    if (saveShade == "report-shade-1") {
        saveShade = "report-shade-2";
    }
    else {
        saveShade = "report-shade-1";              
    }

    hoursPercent = (totalWeekTotal / calculatedTotalHours) * 100;
    myOutputRow = document.getElementById('report-total').innerHTML;
    myOutputRow = myOutputRow.replace(/report-summary/gi, "report-title"); 
    myOutputRow = myOutputRow.replace(/report-shade-entry/gi, saveShade); 
    myOutputRow = myOutputRow.replace(/_REPORTISSUE_/gi, "<font color='red'>TOTALS FOR THE TIME PERIOD: " + Math.round(hoursPercent) + "%</font>"); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY0_/gi, totalWeek[0]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY1_/gi, totalWeek[1]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY2_/gi, totalWeek[2]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY3_/gi, totalWeek[3]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY4_/gi, totalWeek[4]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY5_/gi, totalWeek[5]); 
    myOutputRow = myOutputRow.replace(/_REPORTDAY6_/gi, totalWeek[6]); 
    myOutputRow = myOutputRow.replace(/_REPORTWEEKTOTAL_/gi, totalWeekTotal); 
    myOutputRow = myOutputRow.replace(/_REPORTESTIMATE_/gi, "<font color='red'>" + totalEstimateTotal + "</font>"); 
    myOutputRow = myOutputRow.replace(/_REPORTREMAINING_/gi, "<font color='red'>" + totalRemEstimateTotal + "%</font>"); 
    myOutputRow = myOutputRow.replace(/_REPORTTOTALTOTAL_/gi, "<font color='red'>" + totalTotalTotal + "</font>"); 


    //Add it to the rest
    myOutputRows = myOutputRows + myOutputRow;

    document.getElementById('report-display').innerHTML = myOutputRows;

    //Create our rows
    inputReportObject.issues.forEach(function (issue) {

        //And add our listerners
        document.getElementById("Report-Link-" + issue.key).addEventListener ("click", function(){ jiraIssuelink(config.orgSettings.jiraBaseURI + "/browse/" + issue.key) }); 

    });
    
    //Override the name
    var myReportName;
    if (inputReportObject.report.blnAllUsers)
        myReportName = "All Users - " + inputReportObject.report.name + ":&nbsp;&nbsp;";
    else
        myReportName = userToRun.name + " - " + inputReportObject.report.name + ":&nbsp;&nbsp;";
 
    document.getElementById('report-name').innerHTML = myReportName;

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
    console.log("Alvis Time: API Endpoint: " + config.orgSettings.jiraBaseURI + config.orgSettings.jiraAPIExtension);

    //Setup our JIRA object
    JIRA = JiraAPI(config.orgSettings.jiraBaseURI, config.orgSettings.jiraAPIExtension, "");

    //Set up UI Element for Close Button
    document.getElementById('closeLink').href = "nowhere";
    document.getElementById('closeLink').onclick = closeit;
   
    //Set up the legacy queue
    document.getElementById('helpLink-legacyqueue').href = "nowhere";
    document.getElementById('helpLink-legacyqueue').onclick = openHelp;
    document.getElementById('legacyqueue-postall').onclick = postThemAll;
    document.getElementById('legacyqueue-deleteall').onclick = deleteThemAll;
    document.getElementById("closeLink-legacyqueue").addEventListener ("click", function(){ 
        //Setup the view
        showPageView('everything');
    }); 



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

    //Wire up calendar selector
    document.getElementById("daterange").addEventListener ("focus", function(){ 

        $('input[name="daterange"]').daterangepicker({
            opens: 'left'
          }, function(start, end, label) {
            reportFirstDay = new Date(start);
            reportLastDay = new Date(end);
            //Now shoudl also fire off the report
            generateReport();
          });

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
    document.getElementById("screenshot-image-summary").addEventListener ("click", function(){ legacyView(true, "approved")}); 


    //Set up UI Element for timecard view Button
    //document.getElementById('viewcard-summary').href = "nowhere";
    //document.getElementById('viewcard-summary').onclick = legacyView;    
    document.getElementById("viewcard-image-summary").addEventListener ("click", function(){ legacyView(false, "pending")}); 
    document.getElementById("posttimes-image-summary").addEventListener ("click", function(){ doThePostTimes()}); 
    document.getElementById("viewcard-approved-image-summary").addEventListener ("click", function(){ legacyView(false, "approved")}); 

    //Grab our HTML blocks
    issueGroupHTML = document.getElementById('all-issue-groups-container').innerHTML;
    document.getElementById('all-issue-groups-container').innerHTML = "";

    //And for summary table
    summaryTable = document.getElementById('timecard-summary-wrapper').innerHTML;
    document.getElementById('timecard-summary-wrapper').innerHTML = "";

    //User Buttons
    document.getElementById("help-image-user").addEventListener ("click", function(){ 
        //Setup the view
        showPageView('help-text');
    }); 
    document.getElementById("help-image-config").addEventListener ("click", function(){ 
        //Setup the view
        showPageView('help-text');
    }); 
    document.getElementById("close-image-config").addEventListener ("click", function(){ 
        //If did update, restart
        if (gConfigChangedThisSession) {
            gConfigChangedThisSession = false; //reset back
            loadMainDisplayPage();
        }

        //Clear out our user display
        document.getElementById('config-details').innerHTML = "";

        //Setup the view
        showPageView('everything');
    }); 
    document.getElementById("close-image-user").addEventListener ("click", function(){ 
        //If did update, restart
        if (gConfigChangedThisSession) {
            gConfigChangedThisSession = false; //reset back
            loadMainDisplayPage();
        }
        
        //Clear out our user display
        document.getElementById('user-details').innerHTML = "";
        
        //Setup the view
        showPageView('everything');
    }); 
    //Configuration changed button
    document.getElementById("config-update").addEventListener ("click", function(){ 
            saveConfigChange(configForShow)
    }); 
    document.getElementById("config-update-config").addEventListener ("click", function(){ 
        saveConfigChange(configForShow)
    }); 
    document.getElementById("config-update-summary").addEventListener ("click", function(){ 
        saveConfigChange(configForShow)
    }); 
    document.getElementById("config-update-user").addEventListener ("click", function(){ 
        saveConfigChange(configForShow)
    }); 

    if (gConfigChanged) {
        document.getElementById("configUpdate-user").style.display = 'inline-block';
        document.getElementById("configUpdate-config").style.display = 'inline-block';
        document.getElementById("configUpdate-summary").style.display = 'inline-block';
        document.getElementById("configUpdate").style.display = 'inline-block';
        notificationMessage("You have unsaved config updates - red gear icon to save them", "error");
    }

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
    document.getElementById('logoimage').src = config.orgSettings.logo;        

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

        //Wire up the reprt info buttons
        document.getElementById("report-single-image").addEventListener ("click", function(){ 

            //Toggle the button an value
            generateReport("userTotal");

        }); 
        document.getElementById("report-image").addEventListener ("click", function(){ 

            //Toggle the button an value
            generateReport("teamTotal");

        }); 
        document.getElementById("late-image").addEventListener ("click", function(){ 

            //Toggle the button an value
            sendLateNotification();

        }); 
        document.getElementById("late-image-summary").addEventListener ("click", function(){ 

            //Toggle the button an value
            sendLateNotification();

        });
        document.getElementById("user-image-config").addEventListener ("click", function(){ 

            //Toggle the button an value
            showUserInfo();

        }); 
        document.getElementById("user-image-summary").addEventListener ("click", function(){ 

            //Toggle the button an value
            showUserInfo();

        });
        document.getElementById("user-image").addEventListener ("click", function(){ 

            //Toggle the button an value
            showUserInfo();

        });
        document.getElementById("configuration-image").addEventListener ("click", function(){ 

            //Toggle the button an value
            showConfiguration();

        }); 
        document.getElementById("configuration-image-summary").addEventListener ("click", function(){ 

            //Toggle the button an value
            showConfiguration();

        });
    }
    else {
        document.getElementById("summary-info-image").remove();
        document.getElementById("report-single-image").remove();
        document.getElementById("report-image").remove();
        document.getElementById("late-image").remove();
        document.getElementById("late-image-summary").remove();
        document.getElementById("user-image-config").remove();
        document.getElementById("user-image-summary").remove();
        document.getElementById("user-image").remove();
        document.getElementById("configuration-image").remove();
        document.getElementById("configuration-image-summary").remove();
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
        notificationMessage("You are not logged into Jira.  Please login to resolve: <br><br><br><a target='_new' href='" + config.orgSettings.jiraBaseURI + "'>" + config.orgSettings.jiraBaseURI + "</a>", "error");
        openLink(config.orgSettings.jiraBaseURI);
        closeit();
        //Load JIR URL!
    }
    else if (error.statusText == 'Unknown Error') {
        alert("You are not on the network.  Please connect to the network and try again.");
        notificationMessage("A network error occurred.  You must be on the network and have access to Jira at: <br><br><br><a target='_new' href='" + config.orgSettings.jiraBaseURI + "'>" + config.orgSettings.jiraBaseURI + "</a>", "error");
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
        //AJH #3 - DONE We do not want to wipe this out anymore on change of user

        //Get the issues - need to reset everything since we changed user
        processIssueGroups("userchange");
        return;

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
    if (gConfigChanged) {
        notificationMessage("You have unsaved config updates - red gear icon to save them", "error");
    }
    else {
        if (inputMessageType != "addedissue" && inputMessageType != "previousweek" && inputMessageType != "nextweek") {
            notificationMessage(workgroup.messages.intro, "notification");
        }
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
    userIssueGroups.forEach(function(issueGroup) {
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

    //ResponseObject conatains "response" and "issuesGroup" objects - assign our retreived issues ot the issueGroup
    responseObject.issueGroup.issues = responseObject.issues;

    //Let's process each issue
    responseObject.issueGroup.issues.forEach(function(issue) {

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
                //Entered manually, so add entry comment
                updateWorklogComment(worklog, userToRun.userid + "|" + userToRun.email + "|entry");
                blnShowIt = true;
            } 
            else {
                //onsole.log("TEST: " + worklog.author.key + " VS " + userToRun.userid);
            }
        } else if (worklog.author.name == userToRun.userid) {
            //Entered manually, so add entry comment
            updateWorklogComment(worklog, userToRun.userid + "|" + userToRun.email + "|entry");
            blnShowIt = true;
        }

        if (blnShowIt) {

            //Now lets process our worklog - filter date range and user id from comments
            var myTimeLogDateStarted = new Date(worklog.started);

            //Now convert to CT for compare
            if (myTimeLogDateStarted.getTimezoneOffset() == 300 || myTimeLogDateStarted.getTimezoneOffset() == 360) {
                //Central time - leave it
            }
            else {
                //Diff time zone - convert for comparison
                myTimeLogDateStarted = convertToCentralTime(myTimeLogDateStarted);
            }
  
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
    userIssueGroups.forEach(function(issueGroup) {
        
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
generateReport
****************/
function generateReport(inputReport) {

    //We are busy
    togglePageBusy(true);

    //For our query
    var myJQL = "";
    var myUserQuery = "";

    if (inputReport) {
        //All good
    }
    else {
        inputReport = reportSavedReport;
    } 

    //Save off for re-use
    reportSavedReport = inputReport;

    //Initialize counts
    reportWorkLogFetchCount = 0;
    reportIssueCount = 0;
    reportObject = {};
    reportIssues = [];
    reportIssueWorklogs = [];

    //Initialize dates, if not already initialized
    if (reportFirstDay) {
        //Already set
   }
    else {
        //Initialize these
        reportFirstDay = firstDay;
        reportLastDay = lastDay;
    }

    //We are busy
    togglePageBusy(true);

    //Now lets see if we are done - go thru all issues groups and issues, issues processed = total for the issue group and worklogs processeed = total for each issue
    workgroup.reports.forEach(function(report) {

        if (report.key == inputReport) {

            //Add report to our hold hobject
            reportObject.report = report;

            //Save these off
            saveReportName = document.getElementById('report-name').innerHTML;

            //Add report header
            document.getElementById('report-name').innerHTML = "Running....:&nbsp;&nbsp;";

            //Add users to the list
            if (report.blnAllUsers && (blnAdmin || blnViewer)) {
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

            var dateToUseStart = new Date(reportFirstDay);
            //dateToUseStart.setDate(dateToUseStart.getDate() - 7);           
            myJQL = myJQL.replace(/_TIMECARDSTART_/gi, ISODate(dateToUseStart));
    
            var dateToUseEnd = new Date(reportLastDay);
            dateToUseEnd.setDate(dateToUseEnd.getDate() + 1);
            myJQL = myJQL.replace(/_TIMECARDEND_/gi, ISODate(dateToUseEnd));      
                
            //Save for Error Display
            saveReportJQL = myJQL;
            
            myJQL = myJQL + "&maxResults=500"

            //Save for Error Display
            saveReportJQL = myJQL;

            //Load current selected ates to report
            document.getElementById("daterange").value = ShortDate(dateToUseStart) + " - " + ShortDate(dateToUseEnd);
            //01/01/2018 - 01/15/2018

            console.log("GETTING REPORT ISSUES");

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

    if (responseObject.issues.length == 0) {
        //Didnt get any - we are done
        document.getElementById('report-name').innerHTML = saveReportName;
        notificationMessage(saveReportJQL, "error");
        togglePageBusy(false);
        alert("No issues found for this query");
    }

    reportIssueCount = responseObject.issues.length;
    responseObject.issues.forEach(function(issue) {

        //Initialize our tracking elements
        issue.worklogsProcessed = 0;
        issue.worklogsLoaded = false;
        issue.report = responseObject.report;

        //Now get the worklogs and fill in the objects 
        JIRA.getIssueWorklogs(issue.id, reportFirstDay.getTime() / 1000, issue, responseObject.issueGroup)
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
   
    //Process each worklogs?  Or just store them to be used yet?
    responseObject.worklogs.forEach(function (worklog) {

       //Now lets process our worklog - filter date range and user id from comments
       var worklogDate = new Date(worklog.started);

       //Now convert to CT for compare
       if (worklogDate.getTimezoneOffset() == 300 || worklogDate.getTimezoneOffset() == 360) {
           //Central time - leave it
       }
       else {
           //Diff time zone - convert for comparison
           worklogDate = convertToCentralTime(worklogDate);
       }

       if (worklogDate <= reportLastDay && worklogDate >= reportFirstDay) {

           //Build users selection list
           for (var u=0; u < workgroup.users.length; u++) {
               if (worklog.comment.includes(workgroup.users[u].userid + "|")) {

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

    var newTime = new Date((typeof inputTimeStarted === "string" ? new Date(inputTimeStarted) : inputTimeStarted).toLocaleString("en-US", {timeZone: "America/Chicago"}));   

    //console.log("Alvis Time: Converting to central time from: " + inputTimeStarted + " to " + newTime);

    //var utc = inputTimeStarted.getTime() + (inputTimeStarted.getTimezoneOffset() * 60000); //Current time
    //console.log("Alvis Time: UTC IS:" + Date(utc));

    //var offset = inputTimeStarted.getTimezoneOffset() / 60; //Now hours time zeon diff from UTC
    //console.log("Alvis Time: Offset IS:" + offset);

    //var newTime = new Date(utc + (3600000*offset));
    //console.log("Alvis Time: New Time IS:" + newTime);
    

    //console.log("TIME ZONE OFFSET IS: " + inputTimeStarted.getTimezoneOffset()  + " UTC IS: " + Date(utc) + " OFFSET IS: " + offset + " to " + newTime);

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
    loadMainDisplayPage();

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
        loadMainDisplayPage();
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
loadMainDisplayPage -
****************/    
function loadMainDisplayPage() {

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
    userIssueGroups.forEach(function(issueGroup, issueGroupIndex) {

        //Draw the issue group - it is the dropdown sub-grouping
        drawIssueGroupTable(issueGroup, issueGroupIndex);

        //If our lookup group, save it
        if (issueGroup.key == "lookup") {
            lookupIssueGroup = issueGroup;
            lookupIssueGroupIndex = issueGroupIndex;
        }
    })
    
    //Now have to do the total row
    var row = generateTotalsRow(userIssueGroups);

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
    for (var g=0;g<userIssueGroups.length;g++) {
        for (var i=0;i<userIssueGroups[g].issues.length;i++) {
            //See if this issue matches
            if (userIssueGroups[g].issues[i].key == inputIssueKey) {
                //we have a match
                locationKey = userIssueGroups[g].key + "+" + g + "+" + userIssueGroups[g].issues[i].id + "+" + i + "+" + 2; //2 for Monday
                //alert("LOCATION KEY IS: " + locationKey);
                
                //Expand if not already expanded
                if (!userIssueGroups[g].expandGroup) {
                    userIssueGroups[g].expandGroup = true;
                    document.getElementById(userIssueGroups[g].key + "-details").open = userIssueGroups[g].expandGroup;
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

    var issueGroupObject = userIssueGroups[issueGroupIndex];
    var issueObject = userIssueGroups[issueGroupIndex].issues[issueIndex];
    var workLogObject = userIssueGroups[issueGroupIndex].issues[issueIndex].worklogDisplayObjects[workLogIndex];

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
            userIssueGroups[issueGroupIndex].issues[issueIndex].worklogDisplayObjects[workLogIndex] = worklogDisplayObject;

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
            userIssueGroups.forEach(function(issueGroup) {
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
    console.log("AJH DEBUG: Doing Status update");

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

                    //Lets send an email
                    sendEmail(workgroup.settings.emailOnSubmitForApproval.subject + "Approved!", workgroup.settings.emailOnSubmitForApproval.message, workgroup.settings.emailOnSubmitForApproval.from, workgroup.settings.emailOnSubmitForApproval.to);
 
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

    userIssueGroups.forEach(function(issueGroup) {
        issueGroup.issues.forEach(function(issue) {
            issue.worklogDisplayObjects.forEach(function(workLogObject) {

                if (workLogObject.worklogComment.includes(fromStatus) && Number(workLogObject.worklogId) > 0) {                                                       
                    workLogObject.worklogComment = workLogObject.worklogComment.replace(fromStatus, toStatus);

                    //And if approved, add the proj/sub-project
                    if (toStatus == "approved") {
                        //add proj/sub-proj to the end on APPROVAL
                        if (workLogObject.worklogComment.split("|").length > 2) {
                            workLogObject.worklogComment = workLogObject.worklogComment.split("|")[0] + "|" + workLogObject.worklogComment.split("|")[1] + "|" + toStatus + "|" + issue.classification + "|" + issue.classificationChild;
                        }
                    }
 
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
    userIssueGroups.forEach(function (issueGroup, issueGroupIndex) {

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
        document.body.style.cursor = 'wait';
        document.getElementById('loader-container').style.display = 'block';
        document.getElementById('previousWeek').onclick = doNothing;
        document.getElementById('nextWeek').onclick = doNothing;
        document.getElementById('closeLink').onclick = doNothing;
        blnInteractive = false;
    }
    else {
        document.body.style.cursor = 'default';
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
    issueGroup.name = issueGroup.name.replace(/_GOIMAGE_/gi, "<img id='issue-search' src='" + config.orgSettings.goLogo + "' height='33' style='display: inline-block; vertical-align:middle'>");

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

    jiraLink.addEventListener ("click", function(){ jiraIssuelink(config.orgSettings.jiraBaseURI + "/browse/" + issue.key) }); 
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


    //Gotta fix our bogus classification's (for "problemes", there is none)
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
    else if (inputIssue.classificationChild == "10705 - LandsEnd.com Support") {
        //Support override is problems/incidents
        if (!inputIssue.classificationChild || inputIssue.classificationChild == "") {
            inputIssue.classificationChild = "19461 - Problems/Incidents";
        }
        else {
            if (inputIssue.classificationChild == "Development") {
                inputIssue.classificationChild = "19461 - Problems/Incidents";
            }
        }
    }
}

//Child does not have classificaiton, so inhereit from paernt
function setClassificationFromParent(inputParent, inputIssue, inputIssueGroup) {

    var blnMatch = false;

    //Grab parent from array and use its classification/child

    if (inputIssueGroup) {
        for(var issue of inputIssueGroup.issues) {
            if (inputParent.key == issue.key) {
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

    ///Jira lookup instad    
    JIRA.getIssue(inputParent.id) 
        .then(function(parentIssue) {
            //Get issue successfull, lets st calssificaiton object
            if (workgroup.settings.customFieldForClassification) {
                var customClassificationField = parentIssue.fields[workgroup.settings.customFieldForClassification];
                if (customClassificationField) {
                    inputIssue.classification = customClassificationField.value;
                    if (customClassificationField.child) {
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
            gCountOfParentLookupsDone = gCountOfParentLookupsDone + 1;
        }, function (error) {
            //Get issue failed
            gCountOfParentLookupsDone = gCountOfParentLookupsDone + 1;

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
        if (issueClassification.descriptionChild.length > 0) 
            descToDisplay = issueClassification.descriptionChild;
        else
            descToDisplay = "(no sub-project)"

        var summaryCell = buildHTML('td', descToDisplay, {  
            class: inputClass + '-description'
        });
    }
    else { //Offset
        if (issueClassification.descriptionChild.length > 0) 
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
        if (issueClassification.capacity) {
            var timeInputTotal = buildHTML('th', "<font color='red'>Cap: " + issueClassification.capacity + "%</font>", {
                //style: "display: inline-block",
                class: inputClass  
            });
        }
        else {
            if (userToRun.capacities) {
                var timeInputTotal = buildHTML('th', "<font color='red'>Cap:0 %</font>", {
                    //style: "display: inline-block",
                    class: inputClass  
                });
            }
            else {
                var timeInputTotal = buildHTML('th', "", {
                    //style: "display: inline-block",
                    class: inputClass  
                });
            }

        }
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

//Pushed button for all classification entries to post
function doAddToClassificationPostTimes(inputImage, inputClassificationObjects) {

    //We are busy
    togglePageBusy(true);

    inputImage.src = "images/red_go_button.png";
    addToPostTimes(inputClassificationObjects);
    
    togglePageBusy(false);

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

//Find consolidate duplicate entries in the classificaiton array
function consolidateDuplicateEntries(classificationArray) {

    //create new array
    var newClassificationArray = [];
    var classificationObject;
    var blnMatch = false;

    //iterate thru input array
    classificationArray.forEach(function(classObject) {
        //foreach find in new array
        blnMatch = false;
        newClassificationArray.forEach(function(newClassObject) {
            //if found, add #'s to found entry and replace
            if (classObject.description.toUpperCase() == newClassObject.description.toUpperCase() && classObject.descriptionChild.toUpperCase() == newClassObject.descriptionChild.toUpperCase()) {
                //We have a match - add #'s to found entry and replace
                blnMatch = true;

                //Add our numbers together
                newClassObject.totalTotal = Number(newClassObject.totalTotal + classObject.totalTotal);
                newClassObject.parentClassTotal = Number(newClassObject.parentClassTotal + classObject.parentClassTotal);
                newClassObject.postedTotal = Number(newClassObject.postedTotal + classObject.postedTotal);

                //And the daily numbers    
                newClassObject.dayTotal[0] = Number(newClassObject.dayTotal[0] + classObject.dayTotal[0]);
                newClassObject.dayTotal[1] = Number(newClassObject.dayTotal[1] + classObject.dayTotal[1]);
                newClassObject.dayTotal[2] = Number(newClassObject.dayTotal[2] + classObject.dayTotal[2]);
                newClassObject.dayTotal[3] = Number(newClassObject.dayTotal[3] + classObject.dayTotal[3]);
                newClassObject.dayTotal[4] = Number(newClassObject.dayTotal[4] + classObject.dayTotal[4]);
                newClassObject.dayTotal[5] = Number(newClassObject.dayTotal[5] + classObject.dayTotal[5]);
                newClassObject.dayTotal[6] = Number(newClassObject.dayTotal[6] + classObject.dayTotal[6]);
 
                newClassObject.dayPostedTotal[0] = Number(newClassObject.dayPostedTotal[0] + classObject.dayPostedTotal[0]);
                newClassObject.dayPostedTotal[1] = Number(newClassObject.dayPostedTotal[1] + classObject.dayPostedTotal[1]);
                newClassObject.dayPostedTotal[2] = Number(newClassObject.dayPostedTotal[2] + classObject.dayPostedTotal[2]);
                newClassObject.dayPostedTotal[3] = Number(newClassObject.dayPostedTotal[3] + classObject.dayPostedTotal[3]);
                newClassObject.dayPostedTotal[4] = Number(newClassObject.dayPostedTotal[4] + classObject.dayPostedTotal[4]);
                newClassObject.dayPostedTotal[5] = Number(newClassObject.dayPostedTotal[5] + classObject.dayPostedTotal[5]);
                newClassObject.dayPostedTotal[6] = Number(newClassObject.dayPostedTotal[6] + classObject.dayPostedTotal[6]);
                
           }
        });
        if (!blnMatch) {
            //Not found, add it directly to the new array - MUST DO DEEP COPY - not by reference
            let newClassificationObject = JSON.parse(JSON.stringify(classObject));
            newClassificationArray.push(newClassificationObject);
        }
    });

    return newClassificationArray;

}

//Initialize new object - NOT CURRENTLY USED
function createNewClassificationObject() {

    var myReturnObject ={
        "id": 0,
        "userId": userToRun.userid,
        "legacyPostTime": false, //What is this?
        "weekOf": ISODate(firstDay),
        "description": "",
        "descriptionChild": "",
        "dayTotal": 0,
        "totalTotal": 0,
        "parentClassTotal": 0,
        "dayPostedTotal": [0, 0, 0, 0, 0, 0, 0], //For offset hours
        "postedTotal": 0, //For offset hours
        "timePriority": 0 //Initially, match issueGroup time priority.  May have addtl definitions by project at some point - thos would go here
    }

    return myReturnObject();

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

    document.getElementById('help-version').outerHTML = document.getElementById('help-version').outerHTML.replace("_VERSION_", version);

    //Initialize the view
    showPageView('help-text'); 
    return false;
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
    document.getElementById('config-editor').style.display =  'none';
    document.getElementById('user-editor').style.display =  'none';
    document.getElementById('legacyqueue-editor').style.display =  'none';
    document.getElementById(inputView).style.display =  'block';

}

//Show Configuration Page
function showConfiguration() {

    //Clear out our user display
    document.getElementById('user-details').innerHTML = "";

    //Clear out our config display
    document.getElementById('config-details').innerHTML = "";

    //Hold our elements to have lsiteners on
    gChangeHandlers = [];

    //Hold the path of the object int the tree
    var configKey = {};
    configKey.path = "config";

    //Get our HTML snippets - if we havent already
    if (gConfigFieldRow == "") {
        gConfigFieldRow = document.getElementById("config-field-values").outerHTML;
    }

    if (gConfigDetailsDropDown == "") {
        gConfigDetailsDropDown = document.getElementById("config-details-object").outerHTML;
    }
    
    if (gConfigSummary == "") {
        gConfigSummary = document.getElementById("config-summary-object").outerHTML; 
    }

    //Show the page, unshow the others
    showPageView("config-editor");

    //Grab out HTML element to feed and uncork our config object
    var configDetails = document.getElementById('config-details');
    configDetails.innerHTML = "Unloading the configuration object....";
    configDetails.innerHTML = jsonUnpack(configForShow, configKey);

    //Now should put in all of our change handlers for the fields we added
    gChangeHandlers.forEach(function (changeToHandle) {
        if (document.getElementById(changeToHandle))
            document.getElementById(changeToHandle).addEventListener ("change", function(){ handleConfigChange(this)});  
    });
       
}
//Uncork the object
function jsonUnpack(inputObject, configKey) {

    //Build our HTML to return
    var myResponse = "";
    var arrayKey = "";
    var arrayIndex = -1;

    //Given the object, parse out all of the fields - name/value pairs
    for (let [key, value] of Object.entries(inputObject)) {
        if (Array.isArray(value)) {
            //For arrays, handle each element
            arrayIndex = -1;
            value.forEach(function(valueArrayEntry) {
                //Key for array elements will include the brakets/number
                arrayIndex = arrayIndex + 1;
                arrayKey = key + "[" + arrayIndex + "]";
                //Call routine the will be the HTML for this entry and add it on
                myResponse = myResponse + displayConfig(arrayKey, valueArrayEntry, configKey);
           });
           //Did array...nwo need
        }
        else {
            //Call routine the will be the HTML for this entry and add it on
            myResponse = myResponse + displayConfig(key, value, configKey);
        }
    }

    return myResponse;
}

//Build the HTML do to display our configuration element
function displayConfig(inputKey, inputValue, configKey) {

    var myResponse = "";
    var fieldRowToShow = "";
    var summaryToShow = "";
    var objectDetails = "";
    var detailsToShow = "";
    var saveKey = "";

    //Object or Fields - differen run for each
    if (typeof inputValue === "object" ) {
        if (!inputValue) {
            //Bogus
            myResponse = "";
        }
        else {
            //Save the current keep for when we come back out of drilling down
            saveKey = configKey.path;
            configKey.path = configKey.path + "." + inputKey; //Drill down to next level
            
            //Now uncork this next object as we continue to drill down
            objectDetails = jsonUnpack(inputValue, configKey);

            //Render it in our HTML snippets
            detailsToShow = gConfigDetailsDropDown.replace(/_OBJECTDETAILS_/gi, objectDetails); 
            detailsToShow = detailsToShow.replace(/display: none;/gi, "display: inline-block;");  

            //And put it in the summary HTML Object
            var summaryKey = "";
            if (inputValue.name) {
                summaryKey = inputKey + " - " + inputValue.name;
            }
            else {
                if (inputValue.classification) {
                    summaryKey = inputKey + " - " + inputValue.classification;
                }
                else {
                    summaryKey = inputKey;
                }
            }

            summaryToShow = gConfigSummary.replace(/_OBJECTNAME_/gi, summaryKey); //Name that shows in the HTML detial summary thing
            summaryToShow = summaryToShow.replace(/_OBJECTSUMMARY_/gi, detailsToShow); //The details to display - all of the fields
            summaryToShow = summaryToShow.replace(/display: none;/gi, "display: inline-block;");
            myResponse = summaryToShow;

            //Done drilling down, so rever back
            configKey.path = saveKey;

        }
    }
    else {
        //This is just a field display - at the root of the config tree are fields - name/values pairs

        //Save the current keep for when we come back out of drilling down
        var saveKey = configKey.path;
        configKey.path = configKey.path + "." + inputKey;

        //Render the field in our HTML snippets
        fieldRowToShow = gConfigFieldRow.replace(/_FIELDNAME1_/gi, inputKey);
        fieldRowToShow = fieldRowToShow.replace(/_FIELDVALUE1_/gi, inputValue);
        fieldRowToShow = fieldRowToShow.replace(/_CONFIGPATH_/gi, configKey.path); //This is the ID we will reference for updates
        fieldRowToShow = fieldRowToShow.replace(/display: none;/gi, "display: inline-block;"); 
        
        //Add key to our list of stuff to add handler for
        var blnFoundIt = false;
        gChangeHandlers.forEach(function (changeHandler) {
            if (changeHandler == configKey.path)
                blnFoundIt = true;
        });
        if (!blnFoundIt) {
            gChangeHandlers.push(configKey.path);
        }

            
        //Peel pack to object we are on and return 
        configKey.path = saveKey;

        //And our response HTML is set
        myResponse = fieldRowToShow;
    }

    return myResponse;

}

//Handle add capacity
function updateCapacity(inputItem) {

    var arrayConfigLevels = inputItem.id.split("."); //refernece is object drill will dots as delimeter. ex: user.name
    
    var workgroupsArray = arrayConfigLevels[1].replace("]", "[").split("[");
    var usersArray = arrayConfigLevels[2].replace("]", "[").split("[");;
    var capacitiesArray = arrayConfigLevels[3].replace("]", "[").split("[");;
    var iWorkgroups = workgroupsArray[1];
    var iUsers = usersArray[1];
    var iCapacities = capacitiesArray[1];

    if (inputItem.id.includes(".delete")) {
        //It is a delete
        var classifictionCapacitiesArray = arrayConfigLevels[4].replace("]", "[").split("[");;
        var iclassifictionCapacities = classifictionCapacitiesArray[1];
        configForShow.workgroups[iWorkgroups].users[iUsers].capacities[iCapacities].classificationCapacities.splice(iclassifictionCapacities, 1);
        config.workgroups[iWorkgroups].users[iUsers].capacities[iCapacities].classificationCapacities.splice(iclassifictionCapacities, 1);

    }
    else {
        //Get the values
        var newClassificationValue = document.getElementById(inputItem.id + ".classification").value;
        var newClassificationHours = document.getElementById(inputItem.id + ".hours").value;

        var newClassificationCapacity = {"classification": newClassificationValue, "hours": newClassificationHours}
        configForShow.workgroups[iWorkgroups].users[iUsers].capacities[iCapacities].classificationCapacities.push(newClassificationCapacity);
        config.workgroups[iWorkgroups].users[iUsers].capacities[iCapacities].classificationCapacities.push(newClassificationCapacity);
    }   

    
    //Show Refresh the page
    showUserInfo();
    //We are all done with the change
    configUpdateDisplay();

}

//Handle a change to configuration here
function handleConfigChange(inputItem) {

    var blnDidUpdate = false;
    var blnDidaConfig = false;
    var configKey = {};
    configKey.path = "config";
   
    var arrayConfigLevels = inputItem.id.split("."); //refernece is object drill will dots as delimeter. ex: user.name
    var myConfigForShowObject = configForShow; //Using the unchanged config for doing updates here, with the idea to burn to disk when done
    var myRunningObject = config;

    for (var i = 0; i < arrayConfigLevels.length; i++) {
        if (i == 0) {
            //Skip it - is config
        }
        else {
            //See if array or not
            if (arrayConfigLevels[i].includes("[")) {
                //Is an array - parse it out into field and index
                var splitString = arrayConfigLevels[i].replace("[", "]");
                var splitArray = splitString.split("]");
                var splitField = splitArray[0];
                var splitIndex = parseInt(splitArray[1]);

                 //We have our pices, now drill down to the array and then into the index
                if (blnDidaConfig) {
                    myObject = myObject[splitField];
                }
                else {
                    blnDidaConfig = true;
                    myObject = myConfigForShowObject[splitField];                 
                }

                myObject = myObject[splitIndex];

                //And do our main config
                myRunningObject = myRunningObject[splitField];
                myRunningObject = myRunningObject[splitIndex];
            }
            else {
                if (i == arrayConfigLevels.length - 1) {
                    //Last entry, this is our field
                    var setValue = inputItem.value;
                    if (!isNaN(inputItem.value)) {
                        //Is a number, make it anumber
                        if (inputItem.value.includes(".")) {
                            setValue = parseFloat(inputItem.value);
                        }
                        else {
                            setValue = parseInt(inputItem.value);
                        }
                    }
                    else {
                        if (inputItem.value == "true") {
                            setValue = true;
                        }
                        else {
                            if (inputItem.value == "false") {
                                setValue = false;
                            }
                        }
                    }
                    if (myObject[arrayConfigLevels[i]] != setValue) {
                        myObject[arrayConfigLevels[i]] = setValue;
                        blnDidUpdate = true;

                        //Also lets update the core config, not just the copy for saving
                        myRunningObject[arrayConfigLevels[i]] = setValue;
                    }
                }
                else {
                    //Drill down a level in our object
                    if (blnDidaConfig) {
                        myObject = myObject[arrayConfigLevels[i]];
                    }
                    else {
                        blnDidaConfig = true;
                        myObject = myConfigForShowObject[arrayConfigLevels[i]];
                    }                    
                    myRunningObject = myRunningObject[arrayConfigLevels[i]];
                }
            }
        }
    }
    
    //We are all done with the change
    if (blnDidUpdate) {

        configUpdateDisplay();

    }

    return;
    
}

// Save off our config change
function saveConfigChange(inputConfig) {



    //When click save button, invoke write contents to page and hidden download link gets clicked - like eamil download
    downloadConfigFile(inputConfig);

    //Send user over to JIRA tix that has the attachment config jsons
    gotoUploadpage();

    //drag/drop downloaded file to that loc

    //snag the new attachment url

    //post update to Github config locations to be new attachmet location

    //relaod the config from there...done

    //We are done with the change, reset
    gConfigChanged = false;
    chrome.storage.local.set({"config-updated": false}, function () {});
    document.getElementById("configUpdate-user").style.display = 'none';
    document.getElementById("configUpdate-config").style.display = 'none';
    document.getElementById("configUpdate-summary").style.display = 'none';
    document.getElementById("configUpdate").style.display = 'none';

}

// Do wht we need to for config change
function configUpdateDisplay() {

    //We did a configuration change
    gConfigChanged = true;
    gConfigChangedThisSession = true;

    //Set local storge flag as changed AND save config to local storage
    chrome.storage.local.set({"config-updated": true}, function () {});
    chrome.storage.local.set({"keyStorage": configForShow}, function () {});
    //Make a copy configForShow = JSON.parse(JSON.stringify(config));

    //Enable a post button
    document.getElementById("configUpdate-user").style.display = 'inline-block';
    document.getElementById("configUpdate-config").style.display = 'inline-block';
    document.getElementById("configUpdate-summary").style.display = 'inline-block';
    document.getElementById("configUpdate").style.display = 'inline-block';

}


// Simple Jira api error handling
function downloadConfigFile(inputConfig) {

    var formattedJSON = JSON.stringify(inputConfig, null, "\t"); // Indented with tab
    var encodedUri = "data:text/plain;charset=utf-8," + encodeURIComponent(formattedJSON); //encode spaces etc like a url
    var a = document.createElement('a'); //make a link in document
    var linkText = document.createTextNode("fileLink");
    a.appendChild(linkText);
    a.href = encodedUri;
    a.id = 'fileLink';
    a.download = orgKey + "-" + TimeStamp(Date()) + ".json";
    a.style = "display:none;"; //hidden link
    document.body.appendChild(a);
    document.getElementById('fileLink').click(); //click the link
    document.body.removeChild(a);

}

function gotoUploadpage() {

    //Create screenshot object to pass along
    var screenshotObject = {
        pageToLoad: config.AlvisTime.configUploadLocation,
        takeScreenshot: false,
    };

    //Hold our data on local storage
    chrome.storage.local.set({"screenshotData": screenshotObject}, function () {
        chrome.runtime.sendMessage({action: "screenshot", screenshot: screenshotObject});
        console.log("Alvis Time: Sent Message to go to config upload page");
    });

    return false;

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

//Return the date as mm/dd/yyy
function ShortDate(inputDate) {

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
    return (lMonth + '/' + lDay + '/' + lYear);
}

//Return the timestamp as YYYY-MM-DD-HH-MM-SS
function TimeStamp(inputDate) {

    inputDate = new Date(inputDate);
    var lYear = inputDate.getFullYear();
    var lMonth = inputDate.getMonth()+1;
    var lDay = inputDate.getDate();
    var lHour = inputDate.getHours();
    var lMinute = inputDate.getMinutes();
    var lSecond = inputDate.getSeconds();
    
    if (lDay < 10) {
        lDay = '0' + lDay;
    }
    if (lMonth < 10) {
        lMonth = '0' + lMonth;
    }
    if (lHour < 10) {
        lHour = '0' + lHour;
    }
    if (lMinute < 10) {
        lMinute = '0' + lMinute;
    }
    if (lSecond < 10) {
        lSecond = '0' + lSecond;
    }
    return (lYear + "-" + lMonth + "-" + lDay + "-" + lHour + "-" + lMinute + "-" + lSecond);
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

    console.log("GETTING:" + inputFileName);

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
function getConfig(inputType, inputAction, deleteCacheOnValid, url, callback) {

    
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

                if (inputType == "keyStorage" && gConfigChanged) {
                    //Pending config change, grab it
                    chrome.storage.local.get(inputType, function(response) {
                        if (response) {
                            callback(null, response.keyStorage);
                        }
                        else {
                            //No dice, do error
                            callback(status);
                        }
                    });
                }
                else {
                    var urlObject = {};
                    urlObject[inputType] = xhr.response;
                    if (deleteCacheOnValid) {
                        //All good - flush storage and startFresh
                        chrome.storage.local.clear(function(result){console.log("Alvis Time: New Org Key - Flushed Storage:" + result)});
                     }
                    chrome.storage.local.set(urlObject, function () {});
                    //And call back
                    callback(null, xhr.response);
                }

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
        console.log("Alvis Time: An error occurred while transferring the file.");

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

};

//Now is time to put is back where we were - user, week, page
function initializeApp() {

    chrome.storage.local.get("config-updated", function(data) {
        if (data) {
            if (data["config-updated"]) {
                //Updated but not saved, do alert
                gConfigChanged = true;
            }
        }
    });

    //Grab most recent user, use it if we have one
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

//Find the capacity for this classifiction for this user on this date
function loadCapacity(classificationObject) {

    classificationObject.capacity = 0;
    if (userToRun.capacities) {
        userToRun.capacities.forEach(function(capacity) {
  
            //Load capacity for matching date
            if (capacity.date == "default") {
                capacity.classificationCapacities.forEach(function(classificationCapacity) {
                    if (classificationObject.description.toUpperCase() == classificationCapacity.classification.toUpperCase()) {
                        //This our user, default, classificiation seting.  Only use if not filled already
                        if (!classificationObject.capacity) {
                            classificationObject.capacity = classificationCapacity.hours;
                        }
                    }
                });
            }
            else {
                if (capacity.date == classificationObject.weekOf) {
                    capacity.classificationCapacities.forEach(function(classificationCapacity) {
                        if (classificationObject.description.toUpperCase() == classificationCapacity.classification.toUpperCase()) {
                            //This our user, date, classification setting
                            classificationObject.capacity = classificationCapacity.hours;
                        }
                    });
                }
            }
        });
    }
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
            xhr.addEventListener("error", function() {console.log("Alvis Time - Email Failed - " + inputSubject + " to " + inputTo);});
            xhr.onload = function() {
                var status = xhr.status;
                if (status == 200) {
                    //successful
                    console.log("Alvis Time - Email Succeeded - " + inputSubject + " to " + inputTo);
                } 
                else {
                    //Failed
                    console.log("Alvis Time - Email Failed - " + inputSubject + " to " + inputTo);
                }
            };        
            xhr.send(urlEncodedData);       
        }
        catch(err) {
            console.log("Alvis Time - Email Failed - " + inputSubject + " to " + inputTo);
        }
    }

    return;

}

//Send Late Notification
function sendLateNotification() {
 
    var sendSubject;
    var sendMessage;
    var sendWeekMessage

    sendSubject = config.orgReminderNotice.subject;
    sendMessage = config.orgReminderNotice.message;

    if (lastDay > today) 
        sendWeekMessage = " is almost due. "
    else    
        sendWeekMessage = " is past due. This is late";  

    sendSubject = sendSubject.replace( /_WEEK_/g, document.getElementById('week-dates-description').innerHTML);
    sendSubject = sendSubject.replace( /_DUEMESSAGE_/g, sendWeekMessage );
    sendMessage = sendMessage.replace( /_WEEK_/g, document.getElementById('week-dates-description').innerHTML);
    sendMessage = sendMessage.replace( /_DUEMESSAGE_/g, sendWeekMessage );

    //sendEmail(sendSubject, sendMessage, config.orgReminderNotice.from, userToRun.email);
    sendEmail(sendSubject, sendMessage, config.orgReminderNotice.from, userToRun.email);

    notificationMessage("TO: " + userToRun.email + " SENT: " + sendSubject, "notification");
}

//Show User Info
function showUserInfo() {
    
    var fieldDisplay = "";
    var fieldsDisplay = "";
    var capacityDisplay = "";
    var capacityDisplays = "";
    var capacityDateDisplay = "";
    var changeHandlers = [];
    var changeCapacityHandlers = [];
    var configPathForUser;
    var capacityPath;
    var wgcount = -1;
    var usercount = -1;
    var capacitiesIndex = -1;
    var capacityIndex = -1;
    var capacityID;
    var saveAddCapacity = "";

    //Clear out our user display
    document.getElementById('user-details').innerHTML = "";

    //Clear out our config display
    document.getElementById('config-details').innerHTML = "";

    document.getElementById('user-header').innerHTML = "User Editor - " + userToRun.name;
    
    //Rip thru config until user = user tor un
    for (let [key, value] of Object.entries(config)) {
        if (key == "workgroups") {
            wgcount = -1;
            value.forEach(function(workgroup) {
                wgcount = wgcount + 1;
                for (let [wgkey, wgvalue] of Object.entries(workgroup)) {
                    if (wgkey == "users") {
                        usercount = -1;
                        wgvalue.forEach(function(user) {
                            usercount = usercount + 1;
                            if (user.userid == userToRun.userid) {
                                //we have our match
                                configPathForUser = "config.workgroups[" + wgcount + "].users[" + usercount + "]";
                            }
                        });
                    }
                };
            })
        }
    }

    //Get our HTML snippets - if we havent already
    if (gUserFields == "") {
        gUserFields = document.getElementById("user-field-values").outerHTML;
    }
    if (gUserCapacities == "") {
        gUserCapacities = document.getElementById("user-capacities").outerHTML;
    }
    if (gUserCapacityDate == "") {
        gUserCapacityDate = document.getElementById("user-capacity-date").outerHTML;
    }
    
    //Load our data into it
    for (let [key, value] of Object.entries(userToRun)) {
        if (Array.isArray(value)) {
            value.forEach(function (capacity) {
                capacitiesIndex = capacitiesIndex + 1;
                if (capacity.date) {
                    //Build the capacity display
                    capacityPath = configPathForUser + "." + key + "[" + capacitiesIndex + "]";
                    capacityID = capacityPath + ".date";
                    capacityDateDisplay = gUserCapacityDate;
                    capacityDateDisplay = capacityDateDisplay.replace(/_CAPACITYDATE_/g, capacity.date);
                    capacityDateDisplay = capacityDateDisplay.replace(/_CAPACITYDATEPATH_/g, capacityPath);
                    capacityDateDisplay = capacityDateDisplay.replace(/display:none/g, "display:inline-block");

                    //Add key to our list of stuff to add handler for
                    var blnFoundItHandler = false;
                    changeCapacityHandlers.forEach(function (changeHandler) {
                        if (changeHandler == capacityID)
                            blnFoundItHandler = true;
                    });
                    if (!blnFoundItHandler) {
                        changeCapacityHandlers.push(capacityID);
                    }

                    capacityIndex = -1;
                    capacity.classificationCapacities.forEach(function (classCapacity) {
                        capacityIndex = capacityIndex + 1;
                        capacityID = capacityPath + ".classificationCapacities[" + capacityIndex + "].hours";
                        capacityDisplay = gUserCapacities;
                        capacityDisplay = capacityDisplay.replace(/_CAPACITYCLASS_/g, classCapacity.classification)
                        capacityDisplay = capacityDisplay.replace(/_CAPACITYHOURS_/g, classCapacity.hours);
                        capacityDisplay = capacityDisplay.replace(/_CAPACITYPATH_/g, capacityID);
                        capacityDisplays = capacityDisplays + capacityDisplay;

                        //Add key to our list of stuff to add handler for
                        var blnFoundItHandler = false;
                        changeCapacityHandlers.forEach(function (changeHandler) {
                            if (changeHandler == capacityID)
                                blnFoundItHandler = true;
                        });
                        if (!blnFoundItHandler) {
                            changeCapacityHandlers.push(capacityID);
                        }

                        capacityDisplays = capacityDisplays.replace(/display:none/g, "display:inline-block");
                    })

                    //Here


                    //Add new capacity option
                    //config.workgroups[0].users[16].capacities[0].classificationCapacities
                    //config.workgroups[0].users[16].capacities
                    capacityDisplay = document.getElementById("user-capacity-new").outerHTML;;
                    capacityDisplay = capacityDisplay.replace(/_CAPACITYCLASS_/g, "NEW")
                    capacityDisplay = capacityDisplay.replace(/_CAPACITYHOURS_/g, "0");
                    capacityDisplay = capacityDisplay.replace(/_CAPACITYPATH_/g, capacityPath + ".classificationCapacities");
                    capacityDisplays = capacityDisplays + capacityDisplay;

                    capacityDisplays = capacityDisplays.replace(/display:none/g, "display:inline-block");

                    //And our new handler
                    saveAddCapacity = capacityPath + ".classificationCapacities";
                }
            })
        }
        else {
            if (typeof value === "object" ) {
                if (!value) {
                    //Bogus
                }
                else {
                    //Skip this object?
                    console.log("Alvis Time: Skipping Object - ", JSON.parse(JSON.stringify(value)));
                }
            }
            else {
                var fieldPath = configPathForUser + "." + key;
                fieldDisplay = gUserFields;
                fieldDisplay = fieldDisplay.replace(/_NAME_/g, key)
                fieldDisplay = fieldDisplay.replace(/_VALUE_/g, value);
                fieldDisplay = fieldDisplay.replace(/_CONFIGPATH_/g, fieldPath);
                fieldsDisplay = fieldsDisplay + fieldDisplay;
                
                //Add key to our list of stuff to add handler for
                var blnFoundIt = false;
                changeHandlers.forEach(function (changeHandler) {
                    if (changeHandler == fieldPath)
                        blnFoundIt = true;
                });
                if (!blnFoundIt) {
                    changeHandlers.push(fieldPath);

                }
            }
        }
    }

    fieldsDisplay = fieldsDisplay.replace(/display:none/g, "display:inline-block");

    //Grab out HTML element to feed and uncork our config object
    var userDetails = document.getElementById('user-details');
    userDetails.innerHTML = fieldsDisplay;
    userDetails.innerHTML = userDetails.innerHTML + "<hr>" + capacityDateDisplay + capacityDisplays;

    //Add our handlers
    //Now should put in all of our change handlers for the fields we added
    changeHandlers.forEach(function (changeToHandle) {
        if (document.getElementById(changeToHandle))
            document.getElementById(changeToHandle).addEventListener ("change", function(){ handleConfigChange(this);});  
    });

    //Add our handlers cor capacities
    //Now should put in all of our change handlers for the fields we added
    changeCapacityHandlers.forEach(function (changeToHandle) {
        if (document.getElementById(changeToHandle)) {
            document.getElementById(changeToHandle).addEventListener ("change", function(){ handleConfigChange(this);});  
            document.getElementById(changeToHandle + ".delete").addEventListener ("click", function(){ updateCapacity(this);});  
        }
    });

    document.getElementById(saveAddCapacity).addEventListener ("click", function(){ updateCapacity(this);}); 

    //Show the page, unshow the others
    showPageView("user-editor");

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

    postedClassficationArray.push(inputCLassificationObject); //AJHPOST

    //Get Override of Classification Child if we have one to
    //Not Needed - loadClassificationChild(inputCLassificationObject);

    //Build up view of legacy time card to pass for lod after done posting
    var URLtoLoad = "";
    URLtoLoad = config.orgLegacyTimeIntegration.legacyTimePendingURI;
    URLtoLoad = URLtoLoad.replace(/_LEGACYUSERID_/g, userToRun.legacyTimeID);
    URLtoLoad = URLtoLoad.replace(/_STARTDAY_/g, ISODate(firstDay));

    //Create screenshot object to pass along - Only used for where to land when done
    var endPageObject = {
        pageToLoad: URLtoLoad,
        name: userToRun.name,
        date: ISODate(firstDay),
    };

    //Hold our data on local storage
    chrome.storage.local.set({"postedArray": postedClassficationArray}, function () {
        chrome.runtime.sendMessage({action: "preparepost", timeEntry: inputCLassificationObject, endPage: endPageObject});
    });
}
function addToPostTimes(inputClassificationObjects) { //AJHPOST
     
    //We should set the proj/sub-project on each issue here.  And also approve them.
    //updateWorklogStatuses("approve");
    
    userIssueGroups.forEach(function(issueGroup) {
         issueGroup.issues.forEach(function(issue) {
             console.log("DOING ISSUE: " + issue.fields.summary + " = " + issue.classification + " --> " + issue.classificationChild)
         });
     });
    
    //Add the entries to the collection for posting - no dups
    inputClassificationObjects.forEach(function(classObj) {
        classObj.legacyPostTime = true;
        //Not needed - loadClassificationChild(classObj);
        var foundInPosted = false;
        postedClassficationArray.forEach(function(postedClass) {
            if (!foundInPosted) {
                //AJH #1 DONE - Need USER ID and DATE included in this check - we will be building an array for all users
                if (classObj.description == postedClass.description && classObj.descriptionChild == postedClass.descriptionChild && classObj.id == postedClass.id) {
                    if (classObj.userId == postedClass.userId && classObj.weekOf == postedClass.weekOf) {
                        classObj.legacyPostTime = false;
                        foundInPosted = true;
                    }
                }
            }
        });
        if (!foundInPosted) {
            //Did not find it, so add it now
            postedClassficationArray.push(classObj);   
        }
    });

    //AJH #4 DONE -  we want to store the array....but then stop
    chrome.storage.local.set({"postedArray": postedClassficationArray}, function () {
        console.log("DEBUG: Stored the posted array", postedClassficationArray);
    });

    return;
}

/***************
doThePostTimes - send the array off to be processed
***************/
function doThePostTimes() {

    //Firs setup our header with time estimate
    var countToRun = 0;
    postedClassficationArray.forEach(function(classObj) {
        if (!classObj.blnStarted)
            countToRun = countToRun + 1;
    });
    var headerHTML = "";
    var totalSeconds = countToRun * 20;
    var totalMinutes = Math.floor(totalSeconds / 60);
    var remSeconds = totalSeconds - (totalMinutes * 60);
    headerHTML = "Legacy Queue Review - " + countToRun + " entries tun run. Est Time To Post: " + totalMinutes + ":" + remSeconds;
    document.getElementById("legacyqueue-header").innerHTML = headerHTML;

    //Show the page, unshow the others
    showPageView("legacyqueue-editor");

    console.log("DEBUG: Sending array off ", postedClassficationArray);
  
    var myHTML = "";
    var myRow = "";
    var myHeader = "";
    var userDayTotal0 = 0;
    var userDayTotal1 = 0;
    var userDayTotal2 = 0;
    var userDayTotal3 = 0;
    var userDayTotal4 = 0;
    var userDayTotal5 = 0;
    var userDayTotal6 = 0;
    var userDayTotalTotal = 0;
    var arrayIndex = -1;
    var blnDoTotal = false;
    var saveShade = "report-shade-1";

    myHTML = document.getElementById("legacyqueue-report-details").innerHTML;
    myHeader = document.getElementById("legacyqueue-colheaders").innerHTML;
    myHeader = myHeader.replace(/display:none/gi, "display:block");
    myRow = document.getElementById("legacyqueue-row").innerHTML;
    myRow = myRow.replace(/display:none/gi, "display:block");
    varRows = "";
    postedClassficationArray.forEach(function(classObj) {
        arrayIndex = arrayIndex + 1;
        varRows = varRows + myRow;        
        if (classObj.blnFinished) {
            varRows = varRows.replace(/_QUEUEENTRYCOLOR_/gi, "legacy-queue-text-line-finished"); 
        }
        else {
            if (classObj.blnStarted) {
                varRows = varRows.replace(/_QUEUEENTRYCOLOR_/gi, "legacy-queue-text-line-started"); 
            }
            else {
                varRows = varRows.replace(/_QUEUEENTRYCOLOR_/gi, "legacy-queue-text-line"); 
            }
        }
  
        varRows = varRows.replace("_QUEUEUSERID_", classObj.userId);        
        varRows = varRows.replace("_QUEUEDESCRIPTION_", classObj.description);
        varRows = varRows.replace("_QUEUECHILDDESCRIPTION_", classObj.descriptionChild);
        varRows = varRows.replace("_QUEUEHOURSDAY0_", classObj.dayTotal[0]);
        varRows = varRows.replace("_QUEUEHOURSDAY1_", classObj.dayTotal[1]);
        varRows = varRows.replace("_QUEUEHOURSDAY2_", classObj.dayTotal[2]);
        varRows = varRows.replace("_QUEUEHOURSDAY3_", classObj.dayTotal[3]);
        varRows = varRows.replace("_QUEUEHOURSDAY4_", classObj.dayTotal[4]);
        varRows = varRows.replace("_QUEUEHOURSDAY5_", classObj.dayTotal[5]);
        varRows = varRows.replace("_QUEUEHOURSDAY6_", classObj.dayTotal[6]);      
        varRows = varRows.replace("_QUEUEINFOTOTAL_", classObj.totalTotal);    

        varRows = varRows.replace(/report-shade-entry/gi, saveShade); 

        userDayTotal0 = userDayTotal0 + classObj.dayTotal[0];
        userDayTotal1 = userDayTotal1 + classObj.dayTotal[1];
        userDayTotal2 = userDayTotal2 + classObj.dayTotal[2];
        userDayTotal3 = userDayTotal3 + classObj.dayTotal[3];
        userDayTotal4 = userDayTotal4 + classObj.dayTotal[4];
        userDayTotal5 = userDayTotal5 + classObj.dayTotal[5];
        userDayTotal6 = userDayTotal6 + classObj.dayTotal[6];
        userDayTotalTotal = userDayTotalTotal + classObj.totalTotal;

        blnDoTotal = false;
        if (arrayIndex == postedClassficationArray.length - 1)
            blnDoTotal = true;
        else {
            if (classObj.userId != postedClassficationArray[arrayIndex+1].userId)
                blnDoTotal = true;
        }
            
        if (blnDoTotal) {
            varRows = varRows + myRow;        
            varRows = varRows.replace("_QUEUEUSERID_", "");        
            varRows = varRows.replace("_QUEUEDESCRIPTION_", "");
            varRows = varRows.replace("_QUEUECHILDDESCRIPTION_", "User Total");
            varRows = varRows.replace("_QUEUEHOURSDAY0_", userDayTotal0);
            varRows = varRows.replace("_QUEUEHOURSDAY1_", userDayTotal1);
            varRows = varRows.replace("_QUEUEHOURSDAY2_", userDayTotal2);
            varRows = varRows.replace("_QUEUEHOURSDAY3_", userDayTotal3);
            varRows = varRows.replace("_QUEUEHOURSDAY4_", userDayTotal4);
            varRows = varRows.replace("_QUEUEHOURSDAY5_", userDayTotal5);
            varRows = varRows.replace("_QUEUEHOURSDAY6_", userDayTotal6);      
            varRows = varRows.replace("_QUEUEINFOTOTAL_", userDayTotalTotal);   
            varRows = varRows.replace(/report-shade-entry/gi, saveShade); 

            varRows = varRows + myRow;        
            varRows = varRows.replace("_QUEUEUSERID_", "<hr>");        
            varRows = varRows.replace("_QUEUEDESCRIPTION_", "<hr>");
            varRows = varRows.replace("_QUEUECHILDDESCRIPTION_", "<hr>");
            varRows = varRows.replace("_QUEUEHOURSDAY0_", "<hr>");
            varRows = varRows.replace("_QUEUEHOURSDAY1_", "<hr>");
            varRows = varRows.replace("_QUEUEHOURSDAY2_", "<hr>");
            varRows = varRows.replace("_QUEUEHOURSDAY3_", "<hr>");
            varRows = varRows.replace("_QUEUEHOURSDAY4_", "<hr>");
            varRows = varRows.replace("_QUEUEHOURSDAY5_", "<hr>");
            varRows = varRows.replace("_QUEUEHOURSDAY6_", "<hr>");      
            varRows = varRows.replace("_QUEUEINFOTOTAL_", "<hr>");   
            varRows = varRows.replace(/report-shade-entry/gi, saveShade);           
            
            userDayTotal0 = 0;
            userDayTotal1 = 0;
            userDayTotal2 = 0;
            userDayTotal3 = 0;
            userDayTotal4 = 0;
            userDayTotal5 = 0;
            userDayTotal6 = 0;
            userDayTotalTotal = 0;

            if (saveShade == "report-shade-1") {
                saveShade = "report-shade-2";
            }
            else {
                saveShade = "report-shade-1";              
            }

        }

       //classObj.userId + " " + classObj.weekOf + " " + classObj.description + "-" + classObj.descriptionChild + "-" + classObj.dayTotal[0] + "-" + classObj.dayTotal[1] + "-" + classObj.dayTotal[2] + "-" + classObj.dayTotal[3] + "-" + classObj.dayTotal[4] + "-" + classObj.dayTotal[5] + "-" + classObj.dayTotal[6] + "<br>";
    });
    //myHTML= myHTML.replace("_LEGACYHEADER_", myHeader);
    //myHTML= myHTML.replace("_LEGACYQUEUELIST_", varRows);
    
    console.log("HEADER is " + myHeader);
    console.log("ROWS is " + varRows);
    document.getElementById("legacyqueue-details").innerHTML = '<table style="display:block"><tbody style="display:block">' + myHeader + varRows + '</tbody></table>';
    console.log("DEBUG HTML FINAL is " + document.getElementById("legacyqueue-details").innerHTML);
    return;
}

/***************
postThemAll - send them all off to be processed
***************/
function postThemAll() {

    //Build up view of legacy time card to pass for lod after done posting
    var URLtoLoad = "";
    URLtoLoad = config.orgLegacyTimeIntegration.legacyTimePendingURIAll;
    URLtoLoad = URLtoLoad.replace(/_STARTDAY_/g, ISODate(firstDay));

    //Create screenshot object to pass along - Only used for when to go whewn done
    var endPageObject = {
        pageToLoad: URLtoLoad,
        name: userToRun.name,
        date: ISODate(firstDay),
    };

    //Hold our data on local storage
    chrome.runtime.sendMessage({action: "prepareposts", timeEntries: postedClassficationArray, endPage: endPageObject});
}

/***************
deleteThemAll - delete the whole array
***************/
function deleteThemAll() {

    chrome.storage.local.remove("postedArray", function() {
        postedClassficationArray = [];
        console.log("DEBUG: Started with this posted array", postedClassficationArray);
        //Setup the view
        showPageView('everything');
    });

}

/***************
issueLoadClassificationChild
***************/
function issueLoadClassificationChild(inputIssueObject) {
   
    if (!userToRun.defaultChildClassification)
        userToRun.defaultChildClassification = "Development";

    //Lets fill in our default sub-classification if needed
    if (inputIssueObject.classificationChild.length <= 1) {
        if (inputIssueObject.classification.toUpperCase() == "10705 - LANDSEND.COM SUPPORT") {
            inputIssueObject.classificationChild =  "19461 - Problems/Incidents";
        }
        else {
            inputIssueObject.classificationChild =  userToRun.defaultChildClassification;
        }
    }
    if (userToRun.defaultChildClassification == "Testing") {
        if (inputIssueObject.classificationChild ==  "Development") {
            inputIssueObject.classificationChild =  userToRun.defaultChildClassification;
        }
    }
    if (inputIssueObject.classificationChild == "(no sub-project)") 
        inputIssueObject.classificationChild =  userToRun.defaultChildClassification;
    if (inputIssueObject.classificationChild == "Process, Procedures, Standards") 
        inputIssueObject.classificationChild = "Processes, Procedures, and Standards";
    if (inputIssueObject.classificationChild == "Checkout") 
        inputIssueObject.classificationChild =  userToRun.defaultChildClassification;
    if (inputIssueObject.classificationChild == "Management & Supervision")
        inputIssueObject.classificationChild = "Supervision";

    if (inputIssueObject.classification.toUpperCase() == "10705 - LANDSEND.COM SUPPORT" && inputIssueObject.classificationChild == "Development") {
        inputIssueObject.classificationChild = "19461 - Problems/Incidents";
    }

}


/***************
loadClassificationChild
***************/
function loadClassificationChild(inputCLassificationObject) {
   
    if (!userToRun.defaultChildClassification)
        userToRun.defaultChildClassification = "Development";

    //Lets fill in our default sub-classification if needed
    if (inputCLassificationObject.descriptionChild.length <= 1) {
        if (inputCLassificationObject.description.toUpperCase() == "10705 - LANDSEND.COM SUPPORT") {
            inputCLassificationObject.descriptionChild =  "19461 - Problems/Incidents";
        }
        else {
            inputCLassificationObject.descriptionChild =  userToRun.defaultChildClassification;
        }
    }
    if (userToRun.defaultChildClassification == "Testing") {
        if (inputCLassificationObject.descriptionChild ==  "Development") {
            inputCLassificationObject.descriptionChild =  userToRun.defaultChildClassification;
        }
    }
    if (inputCLassificationObject.descriptionChild == "(no sub-project)") 
        inputCLassificationObject.descriptionChild =  userToRun.defaultChildClassification;
    if (inputCLassificationObject.descriptionChild == "Process, Procedures, Standards") 
        inputCLassificationObject.descriptionChild = "Processes, Procedures, and Standards";
    if (inputCLassificationObject.descriptionChild == "Checkout") 
        nputCLassificationObject.descriptionChild =  userToRun.defaultChildClassification;
    if (inputCLassificationObject.descriptionChild == "Management & Supervision")
        inputCLassificationObject.descriptionChild = "Supervision";

    if (inputCLassificationObject.description.toUpperCase() == "10705 - LANDSEND.COM SUPPORT" && inputCLassificationObject.descriptionChild == "Development") {
        inputCLassificationObject.descriptionChild = "19461 - Problems/Incidents";
    }

}


/***************
Screen Shot utility
***************/
function legacyView(blnTakeScreenshot, inputPageLoadType) {

    var URLtoLoad = "";

    //Make sure we have legacy ID, else we done
    if (!userToRun.legacyTimeID) {
        alert("No Legacy Time ID - Cant laod this report");
        return false;
    }

    //Build URL to laod from our pieces
    switch(inputPageLoadType) {
        case "approved":
            URLtoLoad = config.orgLegacyTimeIntegration.legacyTimeApprovedURI;
            break;
        default:
            URLtoLoad = config.orgLegacyTimeIntegration.legacyTimePendingURI;
    }

    URLtoLoad = URLtoLoad.replace(/_LEGACYUSERID_/g, userToRun.legacyTimeID);
    URLtoLoad = URLtoLoad.replace(/_STARTDAY_/g, ISODate(firstDay));

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

    //New feature is user has specific list of issue groups, as defined in their object.  Set issueGroup list to that - AJHAJH
    userIssueGroups = [];
    if (inputUser.issueGroups) {
        workgroup.issueGroups.forEach(function(issueGroupW) {
            inputUser.issueGroups.forEach(function(issueGroupU) {
                if (issueGroupW.key == issueGroupU) {
                    //We have match, include it
                    console.log("AJH ADDING IG:" + issueGroupW.key);
                    userIssueGroups.push(issueGroupW);
                }

            });

        });

    }
    else {
        userIssueGroups = workgroup.issueGroups;
    }



}



//Useful code for dealing with local storage
// GET: chrome.storage.local.get(function(result){console.log(result)})
// DELETE: chrome.storage.local.clear(function(result){console.log(result)})



