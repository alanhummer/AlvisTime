//This logs to the BACKGROUND PAGE view, seperate debugger from the F12 console per page
//May want to convert this to use chrome.alarms

const baseUrl = "https://letime.atlassian.net";
const apiExtension = "/rest/api/2";
const minHoursForSubmit = 40;
var userId;
var blnPollJira = false;
var blnAdmin = false;
var userArray = []; //will hold objects as {name, userid, role, email}
var blnHaveTimecard = false;
var blnTestOverride = false;
var config;
var JIRA;

console.log("Alvis Time: Is started and running");

//Here we go - load user set and determine if admin
loadJSON("config.json", function(response) { 
    config = JSON.parse(response); 

    JIRA = JiraAPI(baseUrl, apiExtension, "NoJQLToInitialize");

    //Get User info - may want this in a loop/interval.  This stars when browser opens, and if not already logged into Jira, will fail
    //Idea is, to have it try again...then when you are logged in to Jira, it works
    JIRA.getUser()
        .then(onUserSuccess, onUserError);
});

/****************
Fetch for user was Successful -
****************/
function onUserSuccess(response) {
    userId = response.accountId;
    blnPollJira = true;

    var userOptions;
    
    for (var w=0;w<config.workgroups.length;w++) {

        console.log("WE HAVE A WORKGROUP: " + config.workgroups[w].name);
      
        for(var i=0;i<config.workgroups[w].users.length;i++) {
            //console.log("Alvis Time: Loading a user");
            userArray.push(config.workgroups[w].users[i]);
            if (userArray[i].userid == userId) {
                if (userArray[i].role == "admin") {
                    blnAdmin = true;
                    console.log("Alvis Time: You are admin");
                }
            }
        }

        //If admin, start a loop
        //console.log("IS ADMIN CHECK: " + blnAdmin);
        if (blnAdmin) {
            checkForApproval();
            var approvalPoll = setInterval(checkForApproval, 600 * 1000); //** RESET Poll every hour checking for 1-6PM and then querying jira
        }
    }

    //Hourly pull, test if Friday and if in time window 9-6 - an initial check then every hour
    checkForTimecards();
    var timecardPoll = setInterval(checkForTimecards, 300 * 1000); //3600 * 1000); //** RESET Poll every hour checking for 1-6PM and then querying jira
}

/****************
Fetch for user failed -
****************/    
function onUserError(error) {
    console.log("Alvis Time: Failed to get user:" + error);
    blnPollJira = false;
}

/****************
Approval check routine
****************/  
function checkForApproval() {

    //Get today timestamp to use for poll testing
    var today = new Date();

    //if we are during the working day
    if (today.getDay() > 0 && today.getDay() <= 5 ) { //Monday - Friday
        if (today.getHours() >= 9 && today.getHours() <= 18 || blnTestOverride) {    //If we are 9-6
            //for each users, see if they have a card to approve
            for(var i=0;i<userArray.length;i++) {
                jiraTimeCardApprovalCheck(userArray[i]);
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
        JIRA.getIssues()
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
    if (today.getDay() == 5 || blnTestOverride) { //Friday
        if (today.getHours() >= 9 && today.getHours() <= 18 || blnTestOverride) {    //If we are 9-6
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
    JIRA.getIssues()
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
        JIRA.getIssueWorklogs(issue.key, getStartDay().getTime() / 1000)
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
