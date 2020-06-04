/****************
This JS is the main processing set - when DOM loaded, code is fired to get, display, process JIRA time entries
****************/
var config;  //object that will hold all configuration options
var workgroup; //easy reference for designated work group
var user;  //easy reference for designated user

//Setup for the date selection
var range;
var firstDay; //This will hold the first day of our date range - the full date / time of the day
var lastDay; //This will whold the last day of our date range - the full date / time of the day
var offset = 0;
var today = new Date();
var dayOfWeekOffset = today.getDay() + 1;

//User account stuff from self lookup
var orgKey = "";
var userId;
var userEmail;
var userName = "";
var userMinHoursToSubmit = 0;
var userMaxHoursToSubmit = 999;
var blnAdmin = false; //Easy access to admin boolean
var blnRemoteConfig = false;

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

//An individual issues to query
var lookupIssueKeys = [];
var lookupIssueGroup;
var lookupIssueGroupIndex;

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
    document.getElementById('everything').style.display =  'none';
    document.getElementById('orgkeyrequest').style.display =  'none';
    document.getElementById('timecard-summary').style.display =  'none';
    document.getElementById('help-text').style.display =  'none';

    //Loop until it is valid and we did one
    document.getElementById("submit-org-key").addEventListener ("click", function(){ updateOrgKey()}); 
    document.getElementById("setup-new-org").addEventListener ("click", function(){ setupNewOrg()}); 
   
    loadKeyAndOrg();
}

/****************
Load our configuration and kick of the main processing thread on success
****************/
function loadKeyAndOrg() {

    //Initalize this
    config = null;

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

                            switch(data.orgKeya) {
                                case "le-alvis-time":
                                    configURL = "https://api.media.atlassian.com/file/d25f5228-ad3f-4a00-b715-9ce4c53390d6/binary?client=111ec498-20bb-4555-937c-7e6fd65838b8&collection=&dl=true&max-age=2592000&token=eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiIxMTFlYzQ5OC0yMGJiLTQ1NTUtOTM3Yy03ZTZmZDY1ODM4YjgiLCJhY2Nlc3MiOnsidXJuOmZpbGVzdG9yZTpmaWxlOjg1OWRhNWU5LTNhZjUtNDY4MS05ZjNhLWFlOTUzNzFjMWU2NiI6WyJyZWFkIl0sInVybjpmaWxlc3RvcmU6ZmlsZTpkMjVmNTIyOC1hZDNmLTRhMDAtYjcxNS05Y2U0YzUzMzkwZDYiOlsicmVhZCJdfSwiZXhwIjoxNTg4Mjk4MTMzLCJuYmYiOjE1ODgyOTcxNzN9.rwPZx7eT26fT2JVs1UrjxhsxR8JcaXaVmVvdw4Ysw24";
                                    break;
                                default:
                                    configURL = "";
                                    break;
                            }

                            getConfig(configURL,  function(err, response) {
                
                                if (err != null) {
                                    console.log("Alvis Time: Get config error - " + issue.classification, JSON.parse(JSON.stringify(err)));
                                    //Bogus
                                    //We do not have an org key, get one
                                    getNewOrgKey(data.orgKeya, "true");
                                } 
                                else {
                                    //Get all of our config parameters
                                    //config = JSON.parse(response); 
                                    orgKey = data.orgKeya;
                                    config = response;
            
                                    //Get it, so put listner on DOM loaded event
                                    mainControlThread();
                                }
                            });
                        }
                        else {
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
    document.getElementById('everything').style.display =  'none';
    document.getElementById('orgkeyrequest').style.display =  'block';
    document.getElementById('timecard-summary').style.display =  'none';
    document.getElementById('help-text').style.display =  'none';

    document.getElementById('orgkey').value = inputValue;

    if (inputErr == "false") {
        orgKeyMessage("ABC Enter a valid organization key. " + inputValue + " is not valid", "error")
    }
}

function updateOrgKey() {
    //Let's make sure it is valid
    if (document.getElementById("orgkey").value.length > 0) {
        loadConfig(document.getElementById("orgkey").value + ".json", function(response) { 
            //See if it was bogus
            if (response == null || typeof response === 'undefined' || response.length <= 0) {
                //Bogus
                orgKeyMessage("B Enter a valid organization key. " + document.getElementById("orgkey").value + " is not valid", "error")
            }
            else {
                //All good
                chrome.storage.local.set({"orgKeya": document.getElementById("orgkey").value});
                window.location.reload(false); 
                //loadKeyAndOrg();
            }
        });
    }
    else {
        //org key cannot be empty
        orgKeyMessage("C Enter a valid organization key. It cannot be empty.", "error")
    }
}

function setupNewOrg() {
    alert("TO DO: Create interface to setup a new org");
    closeit();
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

    //Setup the view
    document.getElementById('everything').style.display =  'none';
    document.getElementById('orgkeyrequest').style.display =  'none';
    document.getElementById('timecard-summary').style.display =  'block';
    document.getElementById('help-text').style.display =  'none';

    //Load our name
    document.getElementById('timecard-summary-name').innerHTML = userName;

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
                        "description": issue.classification,
                        "descriptionChild": issue.classificationChild,
                        "dayTotal": [0, 0, 0, 0, 0, 0, 0],
                        "totalTotal": 0,
                        "dayPostedTotal": [0, 0, 0, 0, 0, 0, 0],
                        "postedTotal": 0,
                        "timePriority": issueGroup.timePriority //Initially, match issueGroup time priority.  May have addtl definitions by project at some point - thos would go here
                    }

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
    if (classificationTotalsObject.totalTotal > userMaxHoursToSubmit) {
        hoursToOffset = classificationTotalsObject.totalTotal - userMaxHoursToSubmit;
        //Fill in our time to the "posted time" by priority untill we run out (ie: 40)
        //do time priority 1 first, dish out posted time to those items, then 2, then 3...keep going til reach max hours mark
        hoursToDrawDown = userMaxHoursToSubmit;
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
    }

    //For each classification object, if hours > 0 show it to the grid AND we set posted time based on priority, show it here as second line
    classificationArray.forEach(function(classificationObject) {

            console.log("OFFSET: Hours to offset = " + hoursToOffset);

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

            //AJH Here is where the adjustment row goes
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
Main control thread - When document loaded, do this routine
****************/
function mainControlThread() { // BUG: If > 1 time thru (change dorgs) then these initializations cant happen again

    //And make the page inactive
    togglePageBusy(true);

    //initialize our Jira API object
    var JIRA = JiraAPI(config.orgJiraBaseURI, config.orgJiraAPIExtension, "");

    //Log where we are at
    console.log("Alvis Time: API Endpoint: " + config.orgJiraBaseURI + config.orgJiraAPIExtension);

    //Clear out our array/display in case this is a re-post
    
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
    document.getElementById("submit-image").addEventListener ("click", function(){ updateWorklogStatuses()}); 

    //Change org button - anchor, image, div - different ways to do this..here I'll drive div w/eventlistener
    document.getElementById("change-org-image").addEventListener ("click", function(){ getNewOrgKey(orgKey, false)}); 

    //Show time card summary button - anchor, image, div - different ways to do this..here I'll drive div w/eventlistener
    document.getElementById("summary-image").addEventListener ("click", function(){ showTimeCardSummary()}); 
    document.getElementById("close-image-summary").addEventListener ("click", function(){ 
        //Setup the view
        document.getElementById('everything').style.display =  'block';
        document.getElementById('orgkeyrequest').style.display =  'none';
        document.getElementById('timecard-summary').style.display =  'none';
        document.getElementById('help-text').style.display =  'none';
    }); 
    
    //Show time card summary button - anchor, image, div - different ways to do this..here I'll drive div w/eventlistener
    document.getElementById("close-image-help").addEventListener ("click", function(){ 
        //Setup the view
        document.getElementById('everything').style.display =  'block';
        document.getElementById('orgkeyrequest').style.display =  'none';
        document.getElementById('timecard-summary').style.display =  'none';
        document.getElementById('help-text').style.display =  'none';
    });   

    //Set up UI Element for Help Button
    document.getElementById('helpLink-summary').href = "nowhere";
    document.getElementById('helpLink-summary').onclick = openHelp;
    
    //Grab our HTML blocks
    issueGroupHTML = document.getElementById('all-issue-groups-container').innerHTML;
    document.getElementById('all-issue-groups-container').innerHTML = "";

    //And for summary table
    summaryTable = document.getElementById('timecard-summary-wrapper').innerHTML;
    document.getElementById('timecard-summary-wrapper').innerHTML = ""

    //Get User info
    JIRA.getUser()
        .then(onUserSuccess, onUserError);

    /****************
    Fetch for user was Successful -
    ****************/
    function onUserSuccess(response) {

        //Report out we have a user
        if (response.accountId)
            userId = response.accountId;
        else    
            userId = response.key;

        console.log("Alvis Time: User:" + userName + " - " + userId + " - " + userEmail);

        var userOptions;  //This will hold the selection list of users to chane between, if we are an admin

        //This contains multipe workgroups, figure out which one the user is in
        for (var w=0;w<config.workgroups.length;w++) {
            for(var u=0;u<config.workgroups[w].users.length;u++) {
                //See if we found our user account    
                if (config.workgroups[w].users[u].userid == userId) {
                    //We have a user match - what to do if in multiple work groups?
                    if (typeof workgroup === 'undefined') {
                        workgroup = config.workgroups[w];
                        //What to do if user exist more than once?
                        if (typeof user === 'undefined') {
                            user = workgroup.users[u];
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

        userEmail = user.email;
        userName = user.name

        //See if we are admin 
        if (user.role == "admin") {
            blnAdmin = true;
            console.log("Alvis Time: You are admin");
            //Build users selection list
            for (var u=0; u < workgroup.users.length; u++) {
                if (workgroup.users[u].name == user.name) 
                    userOptions = userOptions + "<option selected>" + workgroup.users[u].name + "</option>";
                else
                    userOptions = userOptions + "<option>" + workgroup.users[u].name + "</option>";
            }
        }

        //Set our min hours - if user overirde of workgroup level
        if (typeof user.minHoursToSubmit === 'undefined') {
            userMinHoursToSubmit = workgroup.settings.minHoursToSubmit;
        }
        else {
            userMinHoursToSubmit = user.minHoursToSubmit;
        }
        //Set our max hours - if user overirde of workgroup level
        if (typeof user.maxHoursToSubmit === 'undefined') {
            userMaxHoursToSubmit = workgroup.settings.maxHoursToSubmit;
        }
        else {
            userMaxHoursToSubmit = user.maxHoursToSubmit;
        }

        //Setup the view
        document.getElementById('everything').style.display =  'block';
        document.getElementById('orgkeyrequest').style.display =  'none';
        document.getElementById('timecard-summary').style.display =  'none';
        document.getElementById('help-text').style.display =  'none';
        
        // Set week date range header in html
        range = document.getElementById('week-dates-description');
        getWeek();

        //Put the dates in the columns        
        document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_SAT_/gi, makeMMDD(firstDay));
        document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_SUN_/gi, makeMMDD(addDays(firstDay, 1)));
        document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_MON_/gi, makeMMDD(addDays(firstDay, 2)));
        document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_TUE_/gi, makeMMDD(addDays(firstDay, 3)));
        document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_WED_/gi, makeMMDD(addDays(firstDay, 4)));
        document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_THR_/gi, makeMMDD(addDays(firstDay, 5)));
        document.getElementById('issue-title-header').innerHTML = document.getElementById('issue-title-header').innerHTML.replace(/_FRI_/gi, makeMMDD(lastDay));

        //And logo
        document.getElementById('logoimage').src = config.orgLogo;        

        //If admin, allow to change user
        if (blnAdmin) {
            document.getElementById("user-select").innerHTML = "<select id='user-selection'>" + userOptions + "</select><div class='user-name-display'>&nbsp; " + workgroup.titles.welcome + " " + userName + " - " + workgroup.name + "</div>";
            document.getElementById("user-selection").addEventListener ("change", function(){ changeuser(this.value)});
        }
        else
            document.getElementById("user-select").innerHTML = document.getElementById("user-select").innerHTML + "<div class='user-name-display'>&nbsp;" + workgroup.titles.welcome + " " + userName + "</div>";

        //Close link
        document.getElementById("closeLink").innerHTML = document.getElementById("closeLink").innerHTML.replace(/_CLOSE_/gi, workgroup.titles.close);
        
        //Get the issues and show them off
        processIssueGroups("intro");

    }

    /****************
    Fetch for user failed -
    ****************/    
    function onUserError(error) {
        console.log("Alvis Time: Failed to get user:" + error);
        
        //Enable the page
        togglePageBusy(false);
        
        //Put it to you window instead
        genericResponseError(error);
    }

    /****************
    Change which user we are -
    ****************/    
    function changeuser(inputUsername) {
        
        for (var i=0;i<workgroup.users.length;i++) {
            if (workgroup.users[i].name == inputUsername) {
                userId = workgroup.users[i].userid;
                userEmail = workgroup.users[i].email;
                userName = workgroup.users[i].name;

                //Set our min hours - if user overirde of workgroup level
                if (typeof workgroup.users[i].minHoursToSubmit === 'undefined') {
                    userMinHoursToSubmit = workgroup.settings.minHoursToSubmit;
                }
                else {
                    userMinHoursToSubmit = workgroup.users[i].minHoursToSubmit;
                }
                 //Set our max hours - if user overirde of workgroup level
                 if (typeof workgroup.users[i].maxHoursToSubmit === 'undefined') {
                    userMaxHoursToSubmit = workgroup.settings.maxHoursToSubmit;
                }
                else {
                    userMaxHoursToSubmit = workgroup.users[i].maxHoursToSubmit;
                } 
            }
        }
        console.log("Alvis Time: Changed to " + userName + " + " + userId + " + " + userEmail);

        //Get the issues - need to reset everything since we changed user
        processIssueGroups("userchange");

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
            myJQL = myJQL.replace(/user.name/gi, userName);
            myJQL = myJQL.replace(/user.userid/gi, userId);
            myJQL = myJQL.replace(/user.email/gi, userEmail);

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

        //Document how many we have
        console.log("Alvis Time: We are processing a # of issues: " + responseObject.issueGroup.issues.length);

        //Let's process each issue
        responseObject.issueGroup.issues.forEach(function(issue) {

            //Log it as awe go
            console.log("Alvis Time: Doing issue: " + issue.key);

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

        //ResponseObject conatains "response", "issueGroup" and "issue" objects, assign our worklogs to the issue object
        responseObject.issue.worklogs = responseObject.worklogs;

        //Process each worklogs?  Or just store them to be used yet?
        responseObject.issue.worklogs.forEach(function (worklog) {

            //Now lets process our worklog - filter date range and user id from comments
            var myTimeLogDateStarted = new Date(worklog.started);

            ////OK, we only want worklogs in our date range - Be careful in those date comparisons, lastDay shouldbe MIDNIGHT on last day 23/59/59 - startDay should be 00/00/00 in the AM
            if (myTimeLogDateStarted <= lastDay && myTimeLogDateStarted >= firstDay) {

                //We only want the worklogs with a comment wnd it is tagged for this user
                if (typeof worklog.comment != "undefined") {

                    if (worklog.comment.includes(userId + "|")) {

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
                        
                        //OK, lets load it into our display objects for this issue -what to do if dups?
                        responseObject.issue.worklogDisplayObjects[dayIndex].worklogId = worklog.id;
                        responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeStarted = worklog.started;
                        responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent = worklog.timeSpentSeconds / 3600;
                        responseObject.issue.worklogDisplayObjects[dayIndex].worklogComment = worklog.comment;
                        responseObject.issue.worklogDisplayObjects[dayIndex].worklogDayOfWeek = dayIndex;

                        //Add to our issue, issue group, day and total totals
                        responseObject.issue.issueTotalTime = responseObject.issue.issueTotalTime + responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent;
                        responseObject.issueGroup.dayTotals[dayIndex] = responseObject.issueGroup.dayTotals[dayIndex] +  responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent;
                        responseObject.issueGroup.timeTotal = responseObject.issueGroup.timeTotal + responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent;
                        totalTotal = totalTotal + responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent

                    }
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
            //We are done gathering all of our data. Now lets build out our UI.
            if (!blnPageLoaded) {
                //Keeping track 
                blnPageLoaded = true;
                timecardPageLoad(); //This will load all of the data to the page
            } 
        }
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
                    alert("LOCATION KEY IS: " + locationKey);
                   
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

        //And set our button as well as enabling input - log hours, submit, submitted, approved. Need 1) Total hours 2) Status of all issues
        switch (timecardStatus) {
            case "approved":
                document.getElementById("submit-image").src = "images/approved.png";
                document.getElementById("submit-image").className = "disabled-image";
                setWorklogEnabled(false);
                break;
            case "submitted":
                if (blnAdmin) {
                    document.getElementById("submit-image").src = "images/click-to-approve.png";
                    document.getElementById("submit-image").className = "enabled-image";
                    setWorklogEnabled(true);
                }
                else {
                    document.getElementById("submit-image").src = "images/submitted-for-approval.png";
                    document.getElementById("submit-image").className = "disabled-image";
                    setWorklogEnabled(false);
                }
                break;
            default: //same as "entry" and "submit-for-approval"
                if (totalTotal >= userMinHoursToSubmit) {
                    document.getElementById("submit-image").src = "images/submit-for-approval.png";
                    document.getElementById("submit-image").className = "enabled-image";
                    timecardStatus = "submit-for-approval";
                    setWorklogEnabled(true);
                }
                else {
                    document.getElementById("submit-image").src = "images/log-weekly-hours-to-submit.png";
                    document.getElementById("submit-image").className = "disabled-image";
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
                "worklogComment": userId + "|" + userEmail + "|entry",  //We are using comment to hold person's users ID + email address who logged for + entry/submitted/approved status - new entries are "entry' status
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
                if (totalTotal >= userMinHoursToSubmit)
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
    function updateWorklogStatuses() {

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
                    //Here is where we updates status to approved
                    updateTimecardStatus("submitted", "approved");
                    //Changed status, so reset everything
                    processIssueGroups("worklogsubmitted");
                }
                break;
            case "submit-for-approval":
                //Here is where we updates status to submitted - for every worklog object, update status   
                updateTimecardStatus("entry", "submitted");

                //Changed status, so reset everything
                processIssueGroups("worklogsubmitforapproval");

            default: //includes "entry"
                break;
        }
        
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

            //Add classifcation to list, if not already there
            if (classifications.indexOf(issue.classification) >= 0) {
                //skip it
            }
            else {
                classifications.push(issue.classification);
            }

        })

        //Do our classification selection
        if (classifications.length > 1 && issueGroup.key != "lookup") {
            
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

        document.getElementById(issueGroup.key + "-details").addEventListener("click", function () { });
        
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
        issue.classificationChild = "";
        issue.classification = "";
        if (workgroup.settings.customFieldForClassification) {
            var customClassificationField = issue.fields[workgroup.settings.customFieldForClassification];
            if (customClassificationField) {
                issue.classification = customClassificationField.value;
                if (customClassificationField.child) {
                    issue.classificationChild = customClassificationField.child.value;
                }
                else {
                    issue.classificationChild = "";
                }
            }
            else {
                issue.classification = "No classification defined";
            }
        }
        else {
            issue.classification = "(issues not classified)";
        }

        issue.classification = trim(issue.classification);
        issue.classificationChild = trim(issue.classificationChild);

        var issueDescription;
        var summaryCell;
        if (issue.fields.summary == issue.fields.summary.toUpperCase()) {
            //All upper case - skip classifiations and make it more pronounced
            issueDescription = "<table><tr><td class='big-summary'>" + issue.fields.summary + "</td></tr></table>"
            summaryCell = buildHTML('td', issueDescription, {  
            });
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

        
        //And our buffer
        var varBuffer = buildHTML('text', "", {
            innterText: ""
        });
        var bufferCell = buildHTML('td');
        bufferCell.appendChild(varBuffer);
        row.appendChild(bufferCell);

        return row;

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
        if (rowTotalTotal >= userMinHoursToSubmit)
            timeInputTotal.style.backgroundColor = "green";
        else
            timeInputTotal.style.backgroundColor = "red";        


        // Total cell
        var timeInputTotalCell = buildHTML('td');
        timeInputTotalCell.appendChild(timeInputTotal);

        //Add total tiem entry to the row
        row.appendChild(timeInputTotalCell);
        
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
                        notificationMessage(workgroup.messages.mixedStatuses.replace(/_WORKLOG_/gi, inputWorklogObject.worklogId).replace(/_STATUS_/gi, worklogStatus), "error");
                    }
                }
            }
        }

        return timeInputDay;

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

    /***************
    Week selection routines
    ***************/

    //Get the range of dates for the week, based on offset
    function getWeek(inputOffset) {

        //Get our date objects
        today = new Date();

        if (inputOffset == null || typeof inputOffset === 'undefined' || inputOffset.length <= 0) {
            //If just loaded and today is sun/mon/tues - so default week to LAST week
            if (today.getDay() < 3)
                offset = -1;
            else
                offset = 0; 
        }

        firstDay = new Date();;
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
        if (today.getDay() < 3 && offset == 0) {
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
        
        //Changed the week, so reset everything
        processIssueGroups("previousweek");

        return false; //This causes the href to not get invoked
    }
        
    //Rotate forward 1 week
    function nextWeek() {

        offset = offset + 1;

        getWeek(offset);
            
        //Changed the week, so reset everything
        processIssueGroups("nextweek");

        return false; //This causes the href to not get invoked
    }

}


//Create our sumation row
function generateTimecardSummaryRow(issueClassification, inputClass, inputType, inputColor, inputSize) {

    //Accumulate our sum
    var dailyTotal = [0, 0, 0, 0, 0, 0, 0];
    var rowTotalTotal = 0;
    var showTotal;
    var descToDisplay;
    var hoursPercentage;
    
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

        var summaryCell = buildHTML('th', descToDisplay, {  
            class: inputClass + '-description',
            style: "text-align:left"

        });
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
        var timeInputTotal = buildHTML('th', "", {
            class: inputClass  
        });
    }
    else if (inputType == "fill") {
        var timeInputTotal = buildHTML('td', "", {
            class: inputClass  
        });        
    }
    else if (inputType == "detail" || inputType == "total" || inputType == "offset-total") {
        if (issueClassification.totalTotal > 0) {

            if (inputType == "total") {
                var timeInputTotal = buildHTML('td', issueClassification.totalTotal, {
                    class: inputClass,
                    id: issueClassification.id + "+total"
                });               
            }
            else if (inputType == "offset-total") {
                var timeInputTotal = buildHTML('td', issueClassification.totalTotal, {
                    class: inputClass + "-offset",
                    id: issueClassification.id + "+total"
                });
            }
            else {
                if (hoursPercentage < 10) {
                    var timeInputTotal = buildHTML('td', issueClassification.totalTotal + " - " + hoursPercentage + "%", {
                        class: inputClass,
                        id: issueClassification.id + "+total"
                    });
                }
                else {
                    var timeInputTotal = buildHTML('td', issueClassification.totalTotal + " - " + hoursPercentage + "%", {
                        class: inputClass,
                        id: issueClassification.id + "+total"
                        //style: "color:red;"
                    });
                }              
            }
        }
        else {
            var timeInputTotal = buildHTML('td', "0", {
                class: inputClass,
                id: issueClassification.id + "+total"
            });           
        }
    }
    else { //Offset
        if (issueClassification.totalTotal > 0) {
            if (hoursPercentage < 10) {
                var timeInputTotal = buildHTML('td', issueClassification.totalTotal + " - " + hoursPercentage + "%", {
                    class: inputClass + "-offset",
                    id: issueClassification.id + "+total"
                });
            }
            else {
                var timeInputTotal = buildHTML('td', issueClassification.totalTotal + " - " + hoursPercentage + "%", {
                    class: inputClass + "-offset",
                    id: issueClassification.id + "+total"
                    //style: "color:red;"
                });
            }              
        }
        else {
            var timeInputTotal = buildHTML('td', "-", {
                class: inputClass,
                id: issueClassification.id + "+total"
            });           
        }
    }


    //Add to the column
    row.appendChild(timeInputTotal);
    
    return row;

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

//Open the help window
function openHelp(){

    //Initialize the view
    document.getElementById('everything').style.display =  'none';
    document.getElementById('orgkeyrequest').style.display =  'none';
    document.getElementById('timecard-summary').style.display =  'none';
    document.getElementById('help-text').style.display =  'block';
    
    //chrome.windows.create ({
    //   url: config.orgHelpPage,
    //    type: "popup"
    //});
    //window.open(inputURI);
    return false;

    //window.open(config.orgHelpPage, "_help", "scrollbars=no,resizable=no,status=no,location=no,toolbar=no,menubar=no,width=800px,height=600px,left=0,top=0");
    //return false; //This causes the href to not get invoked
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
function getConfig(url, callback) {

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'json';
    
    xhr.onload = function() {
    
        var status = xhr.status;
        if (status == 200) {
            callback(null, xhr.response);
        } else {
            callback(status);
        }
    };
    
    xhr.send();
};


