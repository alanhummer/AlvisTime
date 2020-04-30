/****************
This JS is the main processing set - when DOM loaded, code is fired to get, display, process JIRA time entries
****************/
const weekDescription = "";
const baseUrl = "https://letime.atlassian.net";  //S/B at org level - if not set, need to have it set or prompt to create org
const apiExtension = "/rest/api/2";  //S/B at org level
const minHoursForSubmit = 40; //S/B at work group level
var jql = "assignee=currentUser()";
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

//Array of issues X worklog entries to fill in the tiemsheet grid - an array of arrays, and then object is stored with all info we need
//var workLogArray = [];
//var workLogArrayIndex = -1;
//var issuesArray = [];
//var issuesArrayIndex = -1;

//User account stuff from self lookup
var userId;
var userEmail;
var userName = "";
var blnAdmin = false; //Easy access to admin boolean

//Is the screen interactive, used for toggle
var blnInteractive = true;
var timecardStatus = "entry"; //Keep track of status of the current time card
var blnClickIsWiredUp = false;
var blnTimeCardStatusInitialized = false;
var blnPageLoaded = false;
var notice = "";
var jiraLink = "https://letime.atlassian.net/secure/RapidBoard.jspa?rapidView=1&projectKey=ALVISTIME";
var startMessage = 'Enter time in 1/4 hour increments. Do not see an issue you neeDDDd? <a class="jira-issue-link" href="' + jiraLink + '" target="_blank">Find it and view it</a>and it will show up.';

//Some HTML snippets to use
var issueGroupHTML;

//A global way to track, good to validate with
var totalTotal = 0;

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

    //Get our configuration and all of the config parameters
    loadJSON("config.json", function(response) { 
        //Get all of our config parameters
        config = JSON.parse(response); 

        //Get it, so put listner on DOM loaded event
        mainControlThread();
    });
}

/****************
Main control thread - When document loaded, do this routine
****************/
function mainControlThread() {

    //Setup message
    notificationMessage(startMessage, "notification");

    //And make the page inactive
    togglePageBusy(true);

    //initialize our Jira API object
    var JIRA = JiraAPI(baseUrl, apiExtension, "");

    //Log where we are at
    console.log("Alvis Time: API Endpoint: " + baseUrl + apiExtension);

    //Set up UI Element for Close Button
    document.getElementById('closeLink').href = "nowhere";
    document.getElementById('closeLink').onclick = closeit;
    
    //Set up UI Element for Previous and next buttons
    document.getElementById('previousWeek').href = "nowhere";
    document.getElementById('previousWeek').onclick = previousWeek;
    document.getElementById('nextWeek').href = "nowhere";
    document.getElementById('nextWeek').onclick = nextWeek;  

    //Workflow button - anchor, image, div - different ways to do this..here I'll drive div w/evenlistener
    document.getElementById("submit-image").addEventListener ("click", function(){ updateWorklogStatuses()}); 

    //Grab our HTML blocks
    issueGroupHTML = document.getElementById('all-issue-groups-container').innerHTML;
    document.getElementById('all-issue-groups-container').innerHTML = "";

    // Set week date range header in html
    range = document.getElementById('week-dates-description');
    getWeek();

    //Get User info
    JIRA.getUser()
        .then(onUserSuccess, onUserError);

    /****************
    Fetch for user was Successful -
    ****************/
    function onUserSuccess(response) {

        //Report out we have a user
        userId = response.accountId;
        userEmail = response.emailAddress;
        userName = response.displayName;
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
        if (typeof user === 'undefined') {
            //sorry charlie
            alert("Sorry, you aren't set up for this app");
            closeit();
        }        

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

        //If admin, allow to change user
        if (blnAdmin) {
            document.getElementById("user-select").innerHTML = "<select id='user-selection'>" + userOptions + "</select><div class='user-name-display'>&nbsp;Greetings " + userName + "</div>";
            document.getElementById("user-selection").addEventListener ("change", function(){ changeuser(this.value)});
        }
        else
            document.getElementById("user-select").innerHTML = document.getElementById("user-select").innerHTML + "<div class='user-name-display'>&nbsp;Greetings " + userName + "</div>";

        //Get the issues and show them off
        getTheIssues();

    }

    /****************
    Fetch for user failed -
    ****************/    
    function onUserError(error) {
        console.log("Alvis Time: Failed to get user:" + error);
        
        //Enable the page
        togglePageBusy(false);
        
        //Sorry charlie - alert and close?
        //alert("Error:" + error.message);
        //closeit();

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
            }
        }
        console.log("Alvis Time: Changed to " + userName + " + " + userId + " + " + userEmail);

        //Get the issues - need to reset everything since we changed user
        getTheIssues();

    }

    /****************
    This does all the calling - restarts everything up
    ****************/       
    function getTheIssues() {

        //Initialize
        var myJQL = "";
        //workLogArray = [];
        //workLogArrayIndex = -1;
        //issuesArray = [];
        //issuesArrayIndex = -1;

        //Disable the page
        togglePageBusy(true);

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

            //Initialize our issue group counters
            console.log("ISSUE GROUP: INITALIZING DAY TOTALS FOR: " + issueGroup.name);
            issueGroup.dayTotals = [0, 0, 0, 0, 0, 0, 0];
            issueGroup.timeTotal = 0;

            // Create the query
            myJQL = issueGroup.query;
            myJQL = myJQL.replace(/user.name/gi, userName);
            myJQL = myJQL.replace(/user.userid/gi, userId);
            myJQL = myJQL.replace(/user.email/gi, userEmail);

            //Initialize our tracking elements
            issueGroup.issuesProcessed = 0;
            issueGroup.issuesLoaded = false;

            //Log the query
            console.log("Alvis Time: Doing a query - " + issueGroup.name + " JQL:" + myJQL);

            //Let run it and get the issues
            JIRA.getIssues(myJQL, issueGroup)
                .then(onIssueFetchSuccess, onIssueFetchFailure);

        })
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
            console.log("Alvis Time: Doing issue: " + issue.id);

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
    Fetch for issues failed -
    ****************/    
    function onIssueFetchFailure(error) {

        //Enable the page
        togglePageBusy(false);

        genericResponseError(error);
    }

    /****************
    Got Worklog Successfully -
    ****************/    
    function onWorklogFetchSuccess(responseObject) {

        var dayIndex;
        var blnDone = true;

        //ResponseObject conatains "response", "issueGroup" and "issue" objects, assign our worklogs to the issue object
        responseObject.issue.worklogs = responseObject.worklogs;

        console.log("BETZ WE HAVE " + userEmail + " COUNT:" + responseObject.issue.worklogs.length);

        //Process each worklogs?  Or just store them to be used yet?
        responseObject.issue.worklogs.forEach(function (worklog) {

            //Now lets process our worklog - filter date range and user id from comments
            var myTimeLogDateStarted = new Date(worklog.started);

            ////OK, we only want worklogs in our date range - Be careful in those date comparisons, lastDay shouldbe MIDNIGHT on last day 23/59/59 - startDay should be 00/00/00 in the AM
            if (myTimeLogDateStarted <= lastDay && myTimeLogDateStarted >= firstDay) {

                //We only want the worklogs with a comment wnd it is tagged for this user
                if (typeof worklog.comment != "undefined") {

                    console.log("BETZ WE HAVE " + userEmail + " COMMENT:" + worklog.comment);

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
                        console.log("BETZ DO WE HAVE IT?: " + userEmail, JSON.parse(JSON.stringify(worklog)));

                        responseObject.issue.worklogDisplayObjects[dayIndex].worklogId = worklog.id;
                        responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeStarted = worklog.started;
                        responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent = worklog.timeSpentSeconds / 3600;
                        responseObject.issue.worklogDisplayObjects[dayIndex].worklogComment = worklog.comment;
                        responseObject.issue.worklogDisplayObjects[dayIndex].worklogDayOfWeek = dayIndex;

                        //AJH TOTAL - xissueGroup.timeTotal, xissueTotal, xissueGroup.dayTotals[dayIndex], xtotalTotal

                        //Add to our issue, issue group, day and total totals
                        responseObject.issue.issueTotalTime = responseObject.issue.issueTotalTime + responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent;
                        responseObject.issueGroup.dayTotals[dayIndex] = responseObject.issueGroup.dayTotals[dayIndex] +  responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent;
                        responseObject.issueGroup.timeTotal = responseObject.issueGroup.timeTotal + responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent;
                        totalTotal = totalTotal + responseObject.issue.worklogDisplayObjects[dayIndex].worklogTimeSpent

                        console.log("ISSUE GROUP: ADDDIN TO: " + responseObject.issueGroup.name + "(" + dayIndex + ")  = " + responseObject.issueGroup.dayTotals[dayIndex]);
                    }
                }
            }
            
             //Increment out tracker
            responseObject.issue.worklogsProcessed++;

        })

        responseObject.issue.worklogsLoaded = true;

        //Now lets see if we are done - go thru all issues groups and issues
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
                                //console.log("DONE ?: " + blnDone + " - " + issueGroup.name + " - " + issue.id + " = " + issue.worklogsProcessed + " VS " + issue.worklogs.length);
                            }
                            else {
                                //Not done yet - not done with worklogs
                                blnDone = false;
                                //console.log("NOT DONE 1: " + blnDone + " - " + issueGroup.name + " - " + issue.id + " = " + issue.worklogsProcessed + " VS " + issue.worklogs.length);
                            }
                        }
                        else {
                            //Not done yet - not started with worklogs
                            blnDone = false;
                            //console.log("NOT DONE 2: " + blnDone + " - " + issueGroup.name + " - " + issue.id + " = " + issue.worklogsLoaded);
                        }
                    })
                }
                else {
                    //Not done yet - not done with issues
                    blnDone = false;    
                    //console.log("NOT DONE 3: " + blnDone + " - " + issueGroup.name + " - " + issueGroup.issuesProcessed + " VS " + issueGroup.issues.length);                 
                }
            }
            else {
                //blnDone done yet - not started with issues
                blnDone = false;
                //console.log("NOT DONE 4: " + blnDone + " - " + issueGroup.name + " - " + issueGroup.issuesLoaded);                 
            }

        })

        //See if we are done
        if (blnDone) {
            //We are done gathering all of our data. Now lets build out our UI.
            console.log("DONE DONE WITH LOADING: " + blnDone, JSON.parse(JSON.stringify(config)));
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

        //For each issue group, for each issue, for each work log
        workgroup.issueGroups.forEach(function(issueGroup, issueGroupIndex) {

            //Draw the issue group - it is the dropdown sub-grouping
            drawIssueGroupTable(issueGroup, issueGroupIndex);

        })
        
        //Now have to do the total row
        var row = generateTotalsRow(workgroup.issueGroups);

        //And add it to our issue group table
        document.getElementById("total-issue-group-table").appendChild(row);   

        //Setup our button
        setButtonStatus();
     
        //Enable the page
        togglePageBusy(false);

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
                if (totalTotal >= minHoursForSubmit) {
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
    Worklog functions
    ****************/

    // AJH NOT USED?  Fetch and refresh worklog row - this is called on initiali laod and when a worklog has been update to refresh that row
    function getWorklogs(issueId, inputIssueIndex) {

        var loader = document.getElementById('loader');

        // show loading
        loader.style.display = 'block';

        //Should maybe re-intailize work log array
        initiatizeWorklogArray(issueId, inputIssueIndex); //We are rebuilding the row in the array, but what is the issue index?
 
        //And also the input value elements
        for (i=0; i<7; i++) {
            var timeInput = document.getElementById(inputIssueIndex + "+" + i);
            if (timeInput) {
                timeInput.value = 0;
            }
        }

        console.log("AJH ISSUEID, IDX: " + issueId + ", " + inputIssueIndex);
 
        // Fetch worklogs for this issue
        // Have to use this API for gettign dated worklogs: api/3/issue/LET-3/worklog?startedAfter=1585338196000
        // Where the startedAfter is date in UNIX timestamp.  ex: "1585872000000".  Can do this with getTime() / 1000
        // This fires off asynchronous call...so the success/error functions dont get called right away
        JIRA.getIssueWorklogs(issueId, firstDay.getTime() / 1000)
            .then(onWorklogFetchSuccess, onWorklogFetchError);

        //Got worklog successful
        function onWorklogFetchSuccessOLD(response) {
            // hide loading
            loader.style.display = 'none';

            //Async with buttons may make this not exist
            if (typeof issuesArray[inputIssueIndex] === 'undefined') {
                //does not exist
                return;
            }

            console.log("AJH GOT SOME WORKLOGS: " + response.worklogs.length);

            issuesArray[inputIssueIndex].issueTotalTime = 0;

            //For each worklog, see if it is before our end date, and if so, add it to our inventory
            response.worklogs.forEach(function(worklog) {
                
                var dayIndex;
                var myTimeLogDateStarted = new Date(worklog.started);
                console.log("AJH TEST : " + inputIssueIndex + " STARTED: " + myTimeLogDateStarted);
                //Be careful in those date comparisons, lastDay shouldbe MIDNIGHT on last day 23/59/59 - startDay should be 00/00/00 in the AM
                if (myTimeLogDateStarted <= lastDay && myTimeLogDateStarted >= firstDay) {

                    //We only want the worklogs with a comment wnd it is tagged for this user
                    if (typeof worklog.comment != "undefined") {
                           
                        if (worklog.comment.includes(userId)) {
                             
                            //It is in our range, so do something with it
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

                            //We have a date match, so we will update the worklogobject for this issue on this date
                            console.log("AJH TRYING : " + inputIssueIndex + " DAY: " + dayIndex);
                            console.dir(worklog);
                            workLogArray[inputIssueIndex][dayIndex].worklogId = worklog.id;
                            workLogArray[inputIssueIndex][dayIndex].worklogTimeSpent = worklog.timeSpentSeconds / 3600; //We want time in hours
                            workLogArray[inputIssueIndex][dayIndex].worklogComment = worklog.comment;
                            workLogArray[inputIssueIndex][dayIndex].worklogDayOfWeek = dayIndex;     

                            //Now is time to update the loaded HTML, if it is there anway.  Asynchronous call has come back and returned here, table s/b already loaded
                            var timeInput = document.getElementById(inputIssueIndex + "+" + dayIndex);
                            if (timeInput) {
                                if (timeInput.value > 0) {
                                    notificationMessage("This is amiss.  2 worklog entires for same person+day. " + myTimeLogDateStarted + " = " + timeInput.value, "error");
                                }
                                timeInput.value = parseInt(timeInput.value) + workLogArray[inputIssueIndex][dayIndex].worklogTimeSpent;
                            }

                            //And position the cursor to the start sinc we rebuild the value and it slid out
                            setCaretPosition(0);

                            //Now add up the issue row
                            issuesArray[inputIssueIndex].issueTotalTime = issuesArray[inputIssueIndex].issueTotalTime + workLogArray[inputIssueIndex][dayIndex].worklogTimeSpent;

                            //Add to the day totals also 
                            document.getElementById("total+" + dayIndex).innerText = Number(document.getElementById("total+" + dayIndex).innerText) + workLogArray[inputIssueIndex][dayIndex].worklogTimeSpent

                            //And we have totals to add up also
                            document.getElementById("total+total").innerText = Number(document.getElementById("total+total").innerText) + workLogArray[inputIssueIndex][dayIndex].worklogTimeSpent     
                            
                            if (document.getElementById("total+total").innerText >= minHoursForSubmit) {
                                document.getElementById("total+total").style.backgroundColor = "green";
                            }
                            else {
                                document.getElementById("total+total").style.backgroundColor = "red";
                            }

                            //Here let's increment our main reporting groups
                            incrementReportingGroups(issuesArray[inputIssueIndex].issueSummary, workLogArray[inputIssueIndex][dayIndex].worklogTimeSpent);

                            //each worklog should have the same worklog status (part of the comment) - lets make sure and set our timecardStatus 
                            
                            var worklogParts = workLogArray[inputIssueIndex][dayIndex].worklogComment.split("|");
                            var worklogUserID = worklogParts[0];
                            var worklogEmail = worklogParts[1];
                            var worklogStatus = worklogParts[2];                           

                            //console.log("PARTS ARE: " + worklogUserID + ", " + worklogEmail + ", " + worklogStatus);
                            //Make sure its valid
                            if (worklogStatus == "entry" || worklogStatus == "submit-for-approval" || worklogStatus == "submitted" || worklogStatus == "approved") {
                                //We are good
                                if (!blnTimeCardStatusInitialized) {
                                    timecardStatus = worklogStatus;
                                    blnTimeCardStatusInitialized = true;
                                }
                                else if (timecardStatus != "submit-for-approval" && timecardStatus != worklogStatus) {
                                    //We have worklogs with mixed statuses..mmmm
                                    notificationMessage("This time card has mixed statuses - " +  workLogArray[inputIssueIndex][dayIndex].worklogId + " = " + worklogStatus, "error");
                                }
                            }
                            
                            //Here is the button toggle - log hoursy, submit, submitted, approved. Need 1) Total hours 2) Status of all issues
                            switch (timecardStatus) {
                                case "approved":
                                    document.getElementById("submit-button").innerHTML = '<img id="submit-image" class="disabled-image" src="images/approved.png" height="33" />';
                                    setWorklogEnabled(false);
                                    break;
                               case "submitted":
                                    if (blnAdmin) {
                                        document.getElementById("submit-button").innerHTML = '<img id="submit-image" class="enabled-image" src="images/click-to-approve.png" height="33" />';
                                        setWorklogEnabled(true);
                                    }
                                    else {
                                        document.getElementById("submit-button").innerHTML = '<img id="submit-image" class="disabled-image" src="images/submitted-for-approval.png" height="33" />';
                                        setWorklogEnabled(false);
                                    }
                                    break;
                                default: //same as "entry" and "submit-for-approval"
                                    if (document.getElementById("total+total").innerText >= minHoursForSubmit) {
                                        document.getElementById("submit-button").innerHTML = '<img id="submit-image" class="enabled-image" src="images/submit-for-approval.png" height="33" />';
                                        timecardStatus = "submit-for-approval";
                                        setWorklogEnabled(true);
                                    }
                                    else {
                                        document.getElementById("submit-button").innerHTML = '<img id="submit-image" class="disabled-image" src="images/log-weekly-hours-to-submit.png" height="33" />';
                                        timecardStatus = "entry";
                                        setWorklogEnabled(true);
                                    }
                                    break;
                            }

                            showWorkLogObject("SHOWING: (" + inputIssueIndex + ", " + dayIndex + ") = ", workLogArray[inputIssueIndex][dayIndex]);                                 
                        }
                    
                    }
                }
                else {
                    console.log("AJH SKIPPED A WORKLOG");
                    console.dir(worklog);
                }
            });          
        }

        //Got worklog failed
        function onWorklogFetchErrorOLD(error) {
            // hide loading inspite the error
            loader.style.display = 'none';
            genericResponseError(error);

        }
        //console.log("PUP UP: Done getting worklogs");
      
    }

    /****************
    Value change handler - when update happens, post it back to Jira
    ****************/   
    function postWorklogTimeChange(worklogChangeItem) {

        var blnValid = true;  //Boolean to hold validity flag for the entry
  
        //Reset if any error message was set
        notificationMessage("", "notification");

        //Lets disable the page
        togglePageBusy(true);

        //console.log("POP UP SYNC: UPDATING THIS ISSUE/DAY INDEX:" + worklogChangeItem.id);
        //console.dir(worklogChangeItem);

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


        console.log("UPD ISSUE ID: "+ workLogObject.worklogIssueId + " WORKLOG ID: " + workLogObject.worklogId + " TIME STARTED: " + workLogObject.worklogTimeStarted + " TIME SPENT: " + workLogObject.worklogTimeSpent + " COMMENT: " + workLogObject.worklogComment + " DAY OF WEEK: " + workLogObject.worklogDayOfWeek);
      
        //Validate it first
        if (worklogChangeItem.value.length <= 0) {
            worklogChangeItem.value = 0;
        }
        
        if (isNaN(worklogChangeItem.value)) {
            blnValid = false; //Not a number
            notificationMessage("Must be NUMERIC for # hours", "error");
        }
        else if (!Number.isInteger(worklogChangeItem.value * 4)) {
            blnValid = false; //Not a 15 minute increment .25,.5.75
            notificationMessage("Must be a in quarter hour increments (.25, .5, .75)", "error");
        }
        else if (worklogChangeItem.value > 16) {
            blnValid = false; //Really? 16 hours a day should be enough
            notificationMessage("You work too much!  Keep it under 16!", "error");
        }
        else if (worklogChangeItem.value < 0) {
            blnValid = false; //Sorry Charlie - no negatives
            notificationMessage("Must be positive number", "error");
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
            //FYI - Call for updating worklog is: PUT /rest/api/2/issue/{issueIdOrKey}/worklog/{id}
      
            //Call to Jir to update thee worklog - actaully always will add an new work log with delta of time incremented
            //This may not work if you go down in hours for adjustment.  May want to change this to an actual update, unless is a new time slot not filled
            JIRA.updateWorklog(workLogObject.worklogIssueId, workLogObject.worklogId, workLogObject.worklogComment, worklogChangeItem.value, getStartedTime(workLogObject.worklogTimeStarted))
                .then(function(responseWorklogObject) {
                //Success
                notificationMessage("Success - " + workLogObject.worklogTimeStarted + " for " + worklogChangeItem.value, "notification");

                console.log("RESPONSE WL: ", JSON.parse(JSON.stringify(responseWorklogObject)));

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

                console.log("DOING DIFF:" + deltaTimeSpent + " ISSUE TOT:" + issueObject.issueTotalTime);

                //And the display values issue Total
                document.getElementById(issueGroupKey + "+" + issueId + "+total").innerText = issueObject.issueTotalTime; 
                
                //Day totals
                document.getElementById("total-total+" + workLogIndex).value = Number(document.getElementById("total-total+" + workLogIndex).value) + deltaTimeSpent;

                 //Total-Total - Turn green/red if nwe changed over/under 40
                document.getElementById("total+total+total").innerText = totalTotal;
                if (totalTotal >= minHoursForSubmit)
                    document.getElementById("total+total+total").style.backgroundColor = "green";
                else
                    document.getElementById("total+total+total").style.backgroundColor = "red"; 
 
                //Gotta update issue group messages
                workgroup.issueGroups.forEach(function(issueGroup) {
                    //Issue Group totals
                    if (issueGroup.timeTotal > 0) 
                        document.getElementById(issueGroup.key + "-issue-group-message").innerText = issueGroup.timeTotal + " hours / " + (100 * issueGroup.timeTotal / totalTotal).toFixed(0) + "%";
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

        //If status is entry, get outta dodge
        switch (timecardStatus) {
            case "approved":
                break;
            case "submitted":
                if (blnAdmin) {
                    //Here is where we updates status to approved
                    updateTimecardStatus("submitted", "approved");
                    //Changed status, so reset everything
                    getTheIssues();
                }
                break;
            case "submit-for-approval":
                //Here is where we updates status to submitted - for every worklog object, update status   
                updateTimecardStatus("entry", "submitted");

                //Changed status, so reset everything
                getTheIssues();

            default: //includes "entry"
                break;
        }

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
                        //console.log("STATUS UPDATE - DOING ONE (" + i + " , " + j + ") = " + workLogObject.worklogId + " is " + workLogObject.worklogComment);
                        
                        JIRA.updateWorklog(workLogObject.worklogIssueId, workLogObject.worklogId, workLogObject.worklogComment, workLogObject.worklogTimeSpent, getStartedTime(workLogObject.worklogTimeStarted))
                        .then(function(data) {
                            //Success
                            notificationMessage("Success - status changed from " + fromStatus + " to " + toStatus, "notification");
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
                        //console.log("WORKOG ENABLED FAILED TO GET:" + issueGroup.key + "+" + issueGroupIndex + "+" + issue.id + "+" + issueIndex + "+" + workLogIndex);
                    }
                    console.log("WORKOG DISABLED SET TO " + workLogEntry.disabled + " FOR:" + issueGroup.key + "-" + issue.id + "+" + w);
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
            document.getElementById('closeLink').doNothing;
            notificationMessage(startMessage, "notification");
            blnInteractive = false;
        }
        else {
            document.getElementById('loader-container').style.display = 'none';
            document.getElementById('previousWeek').onclick = previousWeek;
            document.getElementById('nextWeek').onclick = nextWeek;
            document.getElementById('closeLink').doNothing;
            blnInteractive = true;
        }

    }

    //Draw our issues group - collapsable table/grid
    function drawIssueGroupTable(issueGroup, issueGroupIndex) {
        
        //Create our HTML - replace is goofy, only replaces first occurrence lest you /gi 
        var myIssueGroupHTML = issueGroupHTML.replace(/issueGroup.name/gi, issueGroup.name);
        myIssueGroupHTML = myIssueGroupHTML.replace(/issueGroup.key/gi, issueGroup.key);

        //And put the totals message in
        if (totalTotal > 0) 
            myIssueGroupHTML = myIssueGroupHTML.replace(/_ISSUEGROUP_TOTALS_MESSAGE_/gi, issueGroup.timeTotal + " hours / " + (100 * issueGroup.timeTotal / totalTotal).toFixed(0) + "%");
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

        })

    }

    //Create our issue row - part of the issueGroup
    function generateIssueRow(issueGroup, issueGroupIndex, issue, issueIndex) {

        console.log("DOING ISSUE ROW: ", JSON.parse(JSON.stringify(issue)));
        console.log("SUMMARY: " + issue.fields.summary);
        //id, key, self, summary, description, worklogs

        /********
        Issue row - define here and add stuff to it
        ********/
        var row = buildHTML('tr', null, {
            'data-issue-id': issueGroup.key + "+" + issueGroupIndex + "+" + issue.id + "+" + issueIndex,
            class: 'issueRow'
        });

        /************
        Issue summary
        ************/
        var issueDescription = "<table><tr><td>" + issue.fields.summary + "</td></tr><tr><td class='reporting-group'>11411 Mobile - Development</td></tr></table>"
        var summaryCell = buildHTML('td', issueDescription, {  
            class: 'truncate'
        });

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

        jiraLink.addEventListener ("click", function(){ jiraIssuelink(baseUrl + "/browse/" + issue.key) }); 
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

        console.log("RETURNING ROW: ", JSON.parse(JSON.stringify(row)));

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
        if (rowTotalTotal >= minHoursForSubmit)
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

        console.log("RETURNING ROW: ", JSON.parse(JSON.stringify(row)));

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
            console.log("AJH DOING ISSUE: " + issue.id + ", " + dayIndex + " = UNDEF");
        }
        else {
            //We have right user, right day, drop it in for display
            console.log("AJH DOING ISSUE: " + issue.id + ", " + dayIndex + " = " +  inputWorklogObject.worklogId + " = " + inputWorklogObject.worklogTimeStarted + " = " + inputWorklogObject.worklogTimeSpent + " comment:" + inputWorklogObject.worklogComment);             
            timeInputDay.value = inputWorklogObject.worklogTimeSpent;

            //Lets take care of the worklog status
            var worklogParts = inputWorklogObject.worklogComment.split("|");
            var worklogUserID = worklogParts[0];
            var worklogEmail = worklogParts[1];
            var worklogStatus = worklogParts[2];                           

            console.log("PARTS ARE: " + worklogUserID + ", " + worklogEmail + ", " + worklogStatus);
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
                        notificationMessage("This time card has mixed statuses - " +  inputWorklogObject.worklogId + " = " + worklogStatus, "error");
                    }

                }
            }
        }

        return timeInputDay;

    }




    //AJH NOT USED? Build and show the Issues list table
    function drawIssuesTable(issues) {

        var issueIndex = -1;

        //console.log("POP UP: Inside Drawing table");

        //Differnt tables for the different groups
        var jiraLogTable = document.getElementById('jira-log-time-table');
        var supportLogTable = document.getElementById('support-log-time-table');
        var rtbLogTable = document.getElementById('rtb-log-time-table');
        var adminLogTable = document.getElementById('admin-log-time-table');              
        var totalLogTable = document.getElementById('total-log-time-table');    

        //var tbody = buildHTML('tbody');
        var jiratbody = buildHTML('tbody', null, {
            'id': 'jira-issues-table-body'
        });        
        var supporttbody = buildHTML('tbody', null, {
            'id': 'support-issues-table-body'
        });    
        var rtbtbody = buildHTML('tbody', null, {
            'id': 'rtb-issues-table-body'
        });            
        var admintbody = buildHTML('tbody', null, {
            'id': 'admin-issues-table-body'
        });    
        var totaltbody = buildHTML('tbody', null, {
            'id': 'total-issues-table-body'
        });    

        issues.forEach(function(issue) {
            issueIndex++;
            var reportingGroup;
            if (issue.fields.summary.includes("SUPPORT:")) {
                reportingGroup = "Support: Problems/incidents";
            }
            else if (issue.fields.summary.includes("ADMIN:")) {
                reportingGroup = "Admin: Vacation";
           }
            else if (issue.fields.summary.includes("RTB:")) {
                reportingGroup = "RTB: Non-Project Meetings";
            }
            else {
                reportingGroup = "11434 Mobile Redesing - Development";
            }
            console.log("DOING AN ISSUE:" + issueIndex + " " + issue.key);
            var row = generateLogTableRow(issue.key, issue.fields.summary, reportingGroup, issueIndex);

            if (issue.fields.summary.includes("SUPPORT:")) {
                supporttbody.appendChild(row);
            }
            else if (issue.fields.summary.includes("ADMIN:")) {
                admintbody.appendChild(row);
           }
            else if (issue.fields.summary.includes("RTB:")) {
                rtbtbody.appendChild(row);
            }
            else {
                jiratbody.appendChild(row);
            }
      
        });

        //Append to the tables
        jiraLogTable.appendChild(jiratbody);
        supportLogTable.appendChild(supporttbody);
        adminLogTable.appendChild(admintbody);
        rtbLogTable.appendChild(rtbtbody);

        //Let's do a totals row
        var totalrow = generateLogTableRow("TOTAL", "", "", "total");
        totaltbody.appendChild(totalrow)    
        totalLogTable.appendChild(totaltbody);

    }

    //Close the window when "Close Window" clicked
    function closeit(){

        window.close();
        return false; //This causes the href to not get invoked
    }

    //Open Jira ticket in a new window
    function jiraIssuelink(inputURI) {

        console.log("WE ARE DLING LOINK:" + inputURI);
        chrome.windows.create ({
            url: inputURI,
            type: "popup"
        });
        //window.open(inputURI);
        return false;
    }

    //AJH NOT USED? For the issues list table, generate each html element here
    function OLDgenerateLogTableRow(id, summary, timeReportingGroup, issueIndex) {

        console.log("*** DOING ROW: " + id + " SUMMARY: " + summary + " GROUP: " + timeReportingGroup + " IDX:" + issueIndex);
        console.log("*** ISSUE ARRAY: " + issuesArray[issueIndex]);
        console.log("*** ISSUE ARRAY INDEX LOC:" + issuesArrayIndex);

        /********
        Issue row - define here and add stuff to it
        ********/
        var row = buildHTML('tr', null, {
            'data-issue-id': id
        });

        /************
        Issue summary
        ************/
        var issueDescription = "<table><tr><td>" + summary + "</td></tr><tr><td class='reporting-group'>" + timeReportingGroup + "</td></tr></table>"
        //var summaryCell = buildHTML('td', summary, {
        var summaryCell = buildHTML('td', issueDescription, {  
            class: 'truncate'
        });

         //Write the Summary cell
         row.appendChild(summaryCell);       

        /*************
         Issue ID cell
        *************/
        var idCell = buildHTML('td', null, {
            class: 'issue-id'
        });

        var idText = document.createTextNode(id);

        /*********************
        Link to the JIRA issue
        *********************/

        if (id != "TOTAL") {

            var jiraLink = buildHTML('a', null, {
                //href: baseUrl + "/browse/" + id,
                //id: "link-" + id
                //target: "_blank"
                class: "jira-issue-link"
             });

            jiraLink.addEventListener ("click", function(){ jiraIssuelink(baseUrl + "/browse/" + id) }); 

            //document.getElementById('nextWeek').href = "nowhere";
            //document.getElementById('nextWeek').onclick = nextWeek;  

            jiraLink.appendChild(idText);
            idCell.appendChild(jiraLink);
            row.appendChild(idCell);
        }
        else {
            idCell.appendChild(idText);
            row.appendChild(idCell);         
        }

         //Write the ID cell - which also links to the Jira work issue


        /*********
        Time input for the 7 Days of the Week
        *********/

        //We have the issue and array goes Saturdy --> Friday
        for (var i = 0; i < 7; i++) {

            //Rip thru each day of the week and grab the worklog object for each
                              
            //Show the worklog object, for debugging
            //showWorkLogObject("LOADED (" + issueIndex + ", " + i + ")", workLogArray[issueIndex][i]);

            //Create the html input field for this worklog
            if (id != "TOTAL") {
                var timeInputDay = buildHTML('input', null, {
                    class: 'issue-time-input',
                    'id': issueIndex + "+" + i
                });                
            }
            else {
                var timeInputDay = buildHTML('text', "0", {
                    class: "day-time-total",
                    'id': issueIndex + "+" + i
                });                   
            }

            //Make Saturday and Sunday gray
            if (i < 2) {
                timeInputDay.style.backgroundColor = "#D3D3D3";
            }

            //Wire up the listener to handle posts when the data changes
            timeInputDay.addEventListener ("change", function(){ postWorklogTimeChange(this)});  
  
            if (id != "TOTAL") {
                if (typeof workLogArray[issueIndex][i] === 'undefined') {
                    timeInputDay.value = 0;
                }
                else {
                    timeInputDay.value = workLogArray[issueIndex][i].worklogTimeSpent;
                }
            }
            else {
                timeInputDay.innterText = "0";
            }            

            //Create table cell element for this worklog
            var timeInputDayCell = buildHTML('td');
            timeInputDayCell.appendChild(timeInputDay);

            //Add to the row
            row.appendChild(timeInputDayCell);
        }


        /*********
        Time input TOTAL
        *********/
        if (id != "TOTAL") {
            var timeInputTotal = buildHTML('text', issuesArray[issueIndex].issueTotalTime, {
                class: 'issue-time-total',
                id: issueIndex + "+total"
             });

            timeInputTotal.innerText = issuesArray[issueIndex].issueTotalTime;

            // Total cell
            var timeInputTotalCell = buildHTML('td');
            timeInputTotalCell.appendChild(timeInputTotal);

            //Add total tiem entry to the row
            row.appendChild(timeInputTotalCell);

        }
        else {
            //Empty cell since not totals here
            var timeInputTotal = buildHTML('text', "0", {
                class: 'day-time-total',
                id: issueIndex + "+total"
            });

            //Set the total element to red/green if > 40 yet.
            timeInputTotal.style.backgroundColor = "red";
            timeInputTotal.style.color = "white";

            // Total cell
            var timeInputTotalCell = buildHTML('td');
            timeInputTotalCell.appendChild(timeInputTotal);

            //Add total tiem entry to the row
            row.appendChild(timeInputTotalCell);

        }
        
        //ANd our buffer
        var varBuffer = buildHTML('text', "", {
            innterText: ""
        });
        var bufferCell = buildHTML('td');
        bufferCell.appendChild(varBuffer);
        row.appendChild(bufferCell);

        //All done building row - return it
        //console.log("POP UP: Did an issue row for:" + idText + " AND TOTAL TIME IS:" + issuesArray[issueIndex].issueTotalTime);

        return row;

    }

    /********************
    AJH NOT USED? Inncrement the reporting group counters
    ********************/
    function incrementReportingGroups(inputSummary, inputTime) {                            
            
        if (inputSummary.includes("SUPPORT:")) {
            document.getElementById("total-support").innerText = Number(document.getElementById("total-support").innerText) + inputTime;
        }
        else if (inputSummary.includes("ADMIN:")) {
            document.getElementById("total-admin").innerText = Number(document.getElementById("total-admin").innerText) + inputTime;
        }
        else if (inputSummary.includes("RTB:")) {
            document.getElementById("total-run-the-business").innerText = Number(document.getElementById("total-run-the-business").innerText) + inputTime;
        }
        else {
            document.getElementById("total-project").innerText = Number(document.getElementById("total-project").innerText) + inputTime;
        }

        //Now let's recaculate the percentages
        var totalTime = Number(document.getElementById("total-support").innerText) + Number(document.getElementById("total-admin").innerText) + Number(document.getElementById("total-run-the-business").innerText) + Number(document.getElementById("total-project").innerText);
        document.getElementById("total-support-percent").innerText = round(parseFloat(document.getElementById("total-support").innerText * 100 / totalTime).toFixed(0), 0) +"%"; 
        document.getElementById("total-admin-percent").innerText = round(parseFloat(document.getElementById("total-admin").innerText * 100 / totalTime).toFixed(0), 0) +"%"; 
        document.getElementById("total-run-the-business-percent").innerText = round(parseFloat(document.getElementById("total-run-the-business").innerText * 100 / totalTime).toFixed(0), 0) +"%"; 
        document.getElementById("total-project-percent").innerText = round(parseFloat(document.getElementById("total-project").innerText * 100 / totalTime).toFixed(0), 0) +"%"; 
 
        //console.log("AJH DID CALC OF " + document.getElementById("total-project").innerText + " % " + totalTime + " = " + (document.getElementById("total-project").innerText / totalTime));
    }
  

    /***************
    Week selection routines
    ***************/

    //Get the range of dates for the week, based on offset
    function getWeek(offset) {
        offset = offset || 0; // if the function did not supply a new offset, the offset is 0
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

        range.innerHTML = 'WEEK OF  ' + makeDateString(firstDay) + ' - ' + makeDateString(lastDay);

    }
        
    //Create nicely formatted date for use
    function makeDateString(date) {
        var dd = date.getDate();
        var mm = date.getMonth() + 1;
        var y = date.getFullYear();
        
        var dateString = mm + '/'+ dd + '/'+ y;
        return dateString;
        
    }

    //Rotate back 1 week
    function previousWeek() {

        offset = offset - 1;

        getWeek(offset);
        
        //Changed the week, so reset everything
        getTheIssues();

        return false; //This causes the href to not get invoked
    }
        
    //Rotate forward 1 week
    function nextWeek() {

        offset = offset + 1;

        getWeek(offset);
            
        //Changed the week, so reset everything
        getTheIssues();

        return false; //This causes the href to not get invoked
    }

}

/***************
Helper functions 
***************/

//Do nthing....
function doNothing() {
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

// Set the cursor position in a text area, useful after reposting and re-drawing the table
function setCaretPosition() {
    
    var elem = document.activeElement;
    var caretPos = 0;

    if(elem != null) {
        //This will do it if cursor in the field already
        if(elem.createTextRange) {
            var range = elem.createTextRange();
            range.move('character', caretPos);
            range.select();
        }
        //This will do it if cursor in another field
        else {
            //Skip moving fields I think
            if(elem.selectionStart) {
                elem.focus();
                elem.setSelectionRange(caretPos, caretPos + 2);
            }
            else
                elem.focus();
            
        }
    }
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

// Get Query String parameter
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
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
