/****************
This JS is the main processing set - when DOM loaded, code is fired to get, display, process JIRA time entries
****************/
const weekDescription = "";
const baseUrl = "https://letime.atlassian.net";
const apiExtension = "/rest/api/2";
const minHoursForSubmit = 40;
var jql = "assignee=currentUser()";

//Setup for the date selection
var range;
var firstDay; //This will hold the first day of our date range - the full date / time of the day
var lastDay; //This will whold the last day of our date range - the full date / time of the day
var offset = 0;
var today = new Date();
var dayOfWeekOffset = today.getDay() + 1;

//Array of issues X worklog entries to fill in the tiemsheet grid - an array of arrays, and then object is stored with all info we need
var workLogArray = [];
var workLogArrayIndex = -1;
var issuesArray = [];
var issuesArrayIndex = -1;

//User account stuff
var userId;
var userEmail;
var userName = "";
var blnAdmin = false;
var userArray = []; //will hold objects as {name, userid, role, email}

//Is the screen interactive, used for toggle
var blnInteractive = true;
var timecardStatus = "entry"; //Keep track of status of the current time card
var blnClickIsWiredUp = false;
var blnTimeCardStatusInitialized = false;
var notice = "";
var jiraLink = "https://letime.atlassian.net/secure/RapidBoard.jspa";
var startMessage = 'Enter time in 1/4 hour increments. Do not see an issue you neeDDDd? <a class="jira-issue-link" href="' + jiraLink + '" target="_blank">Find it and view it</a>and it will show up.';

/* For refereence, worklog array will have these properties  {
    "worklogIssueId": 
    "worklogId": 
    "worklogTimeStarted": 
    "worklogTimeSpent": 
    "worklogComment": 
    "worklogDayOfWeek": 
}
*/

/* For refereence, issue array will have these properties  {
    "issueId": 
    "issueTotalTime": 
}
*/

//See if we have a notifiation to show
notice = getUrlParameter("notice");
if (notice.length > 0) {   
    alert("Got this: " + notice); 
    window.close();
}

document.addEventListener('DOMContentLoaded', onDOMContentLoaded, false);

/****************
Main control thread - When document loaded, do this routine
****************/
function onDOMContentLoaded() {
    
    //Setup message
    notificationMessage(startMessage, "notification");

    // show main loading spinner
    toggleVisibility('div[id=loader-container]');    

    var JIRA = JiraAPI(baseUrl, apiExtension, jql);

    console.log("LE-TIME API Endpoint: " + baseUrl + apiExtension);

    //Close Button
    document.getElementById('closeLink').href = "nowhere";
    document.getElementById('closeLink').onclick = closeit;

    //Admin toggle for testing
    //document.getElementById('admin').href = "nowhere";
    //document.getElementById('admin').onclick = toggleAdmin;
    
    //Previous and next buttons
    document.getElementById('previousWeek').href = "nowhere";
    document.getElementById('previousWeek').onclick = previousWeek;
    document.getElementById('nextWeek').href = "nowhere";
    document.getElementById('nextWeek').onclick = nextWeek;  

    //Workflow button - anchor, image, div - different ways to do this..here I'll drive div w/evenlistener
    document.getElementById("submit-button").addEventListener ("click", function(){ updateWorklogStatuses()}); 

    //For the collapsbile overlays
	$( document ).trigger( "enhance" );

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
        userId = response.accountId;
        userEmail = response.emailAddress;
        console.log("LE-TIME User:" + userName + " - " + userId + " - " + userEmail);

        //Here is where we want to figure out if they are group admin role - if so, blnAdmin set and drop down to post time for someone else
        JIRA.loadJSON("users.json", function(response) { 
            var usersJSON = JSON.parse(response); 
            var userOptions;

            //console.log("OK - we loaded it.  Size is: " + usersJSON.workgroup.users.length);
            //console.dir(usersJSON);    
            
            for(var i=0;i<usersJSON.workgroup.users.length;i++){
                userArray.push(usersJSON.workgroup.users[i]);
                //console.log("DID ONE (" + i + ")");
                //console.dir(userArray[i]);
                //console.log("FIELDS ARE USERID:" + userArray[i].userid + " ROLE:" + userArray[i].role + " NAME:" + userArray[i].name);

                if (userArray[i].userid == userId) {
                    userOptions = userOptions + "<option selected>" + userArray[i].name + "</option>";
                    userName = userArray[i].name;
                    if (userArray[i].role == "admin") {
                        blnAdmin = true;
                        console.log("You are admin");
                    }
                    //We have a match, lets build our JQL
                    buildJQL(userName);
                }
                else {
                    userOptions = userOptions + "<option>" + userArray[i].name + "</option>";
                }
            }

            //If user does not have access, let them off EZ
            if (userName.length <= 0) {
                //sorry charlie
                alert("Sorry, you aren't set up for this app");
                closeit();
            }

            //If admin, allow to change user
            if (blnAdmin) {
                document.getElementById("user-select").innerHTML = "<select id='user-selection'>" + userOptions + "</select><div class='user-name-display'>&nbsp;Greetings " + userName + "</div>";
                document.getElementById("user-selection").addEventListener ("change", function(){ changeuser(this.value)});
            }
            else
                document.getElementById("user-select").innerHTML = document.getElementById("user-select").innerHTML + "<div class='user-name-display'>&nbsp;Greetings " + userName + "</div>";

            //Now get the issues
            buildJQL(userName);
            getTheIssues();

        });
    }

    /****************
    Fetch for user failed -
    ****************/    
    function onUserError(error) {
        console.log("LE-TIME Failed to get user:" + error);
        genericResponseError(error);
    }

    //Change which user we are
    function changeuser(inputUsername) {
        
        for (var i=0;i<userArray.length;i++) {
            if (userArray[i].name == inputUsername) {
                userId = userArray[i].userid;
                userEmail = userArray[i].email;
                userName = userArray[i].name;
            }
        }
        console.log("I AM NOW: " + userName + " + " + userId + " + " + userEmail);

        //Change the query to be the new user
        buildJQL(userName);
        getTheIssues();

        //We should rebuild the issues list, and JQL should be new users query

    }

    /****************
    This does all the calling - restarts everything up
    ****************/       
    function getTheIssues() {

        //Initialize
        workLogArray = [];
        workLogArrayIndex = -1;
        issuesArray = [];
        issuesArrayIndex = -1;
        blnTimeCardStatusInitialized = false;

        document.getElementById("submit-button").innerHTML = '<img id="submit-image" class="disabled-image" src="images/log-weekly-hours-to-submit.png" height="33" />';
        timecardStatus = "entry";

        //Clear the 4 tables with issue types - on date forward/backward have to start over
        var issuesTableBody = document.getElementById("jira-issues-table-body");
        if (issuesTableBody)
            issuesTableBody.parentNode.removeChild(issuesTableBody);
        
        var issuesTableBody = document.getElementById("support-issues-table-body");
        if (issuesTableBody)
            issuesTableBody.parentNode.removeChild(issuesTableBody);

        var issuesTableBody = document.getElementById("rtb-issues-table-body");
        if (issuesTableBody)
            issuesTableBody.parentNode.removeChild(issuesTableBody);

        var issuesTableBody = document.getElementById("admin-issues-table-body");
        if (issuesTableBody)
            issuesTableBody.parentNode.removeChild(issuesTableBody);

        var issuesTableBody = document.getElementById("total-issues-table-body");
        if (issuesTableBody)
            issuesTableBody.parentNode.removeChild(issuesTableBody);

        //Clear out the reporing group buckets
        initializeReportingGroups();

        // fetch issues
        JIRA.getIssues()
            .then(onFetchSuccess, onFetchError);

        //Problem is here - if hit weekly scroll, calls this again and everything shoudl be reinitialized.

    }

    /****************
    Fetch for issues was Successful -
    ****************/
    function onFetchSuccess(response) {

        var issues = response.issues;

        // asynchronously fetch and draw total worklog time
        //console.log("POP UP: Got issues - Getting work logs");

        issues.forEach(function(issue) {

            //For each issue, set up the array of objects entries for showing and processing the weekly data grid
            workLogArrayIndex++;
            workLogArray[workLogArrayIndex] = [];

            //And the issue Array
            var issueObject = {
                "issueId": issue.key,
                "issueTotalTime": 0,
                "issueSummary" : issue.fields.summary  //We have to store info on the issue so we can determine how to sum it up (project/sub-project)
            }

            issuesArrayIndex++;
            issuesArray[issuesArrayIndex] = issueObject;            



            // duplicate call initiatlizeWorklogArray(issue.key, issuesArrayIndex);

            //Now get the worklogs and fill in the objects
            getWorklogs(issue.key, issuesArrayIndex);
            //console.log("POP UP: DID GET OF AN ISSUE");

        });

        //the getWorklogs fires off asynchronous Jira call and doens't wait for it to come back. So, this code runs with empty ojects in the array
        //console.log("POP UP: Drawing table");

        // create issues HTML table
        drawIssuesTable(issues);

        //console.log("POP UP: Done drwaing issues table");

        // hide main loading spinner
        toggleVisibility('div[id=loader-container]');

        //Make the page interactive again
        toggleInteractive(true);

    }

    /****************
    Initialize the Wwork Log array for a given issue index/id
    ****************/    
    function initiatlizeWorklogArray(issueId, issueIndex) {

        //console.log("POP UP SYNC: FIRSTDAY TIME:" + firstDay);

        //Load and initialize the worklog objects, one for each day of the week for this worklog
        for (var j = 0; j < 7; j++) {
        
            //we want to do this for the days of the week, so dayDay + j
            var nextDay = new Date(firstDay); //This should be the selected weeks view Saturday - shwihc is FirstDay 
            nextDay.setDate(nextDay.getDate() + j);
            //console.log("POP UP SYNC: NEXTDAY TIME:" + nextDay);

            var startOfTheDay = new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate(), 0, 0, 0, 0);

            //startOfTheDay.setDate(firstDay.getDate() + 1);
            var worklogObect = {
                "worklogIssueId": issueId,
                "worklogId": 0,
                "worklogTimeStarted": startOfTheDay,
                "worklogTimeSpent": 0,
                "worklogComment": userId + "|" + userEmail + "|entry",  //We are using comment to hold person's users ID + email address who logged for + entry/submitted/approved status - new entries are "entry' status
                "worklogDayOfWeek": ""
            }
 
            if (typeof workLogArray[issueIndex] === 'undefined') {
                //does not exist - maybe if pre/next buttons clicked an asynch of thread overlay each other
                return;  
            }
            else {
                //Decrement our day totals and total of totals
                var dayTotal = document.getElementById("total+" + j);
                if (dayTotal)
                    dayTotal.innerText = Number(dayTotal.innerText) - workLogArray[issueIndex][j].worklogTimeSpent;
                
                var totTotal = document.getElementById("total+total");
                if (totTotal)
                    totTotal.innerText = Number(totTotal.innerText) - workLogArray[issueIndex][j].worklogTimeSpent;

                //Lets decrement our key counters too
                if (typeof workLogArray[issueIndex][j] === 'undefined') {
                    //console.log("AJH UNDEFINED ENTRY: " + issueIndex);
                }
                else {
                    incrementReportingGroups(issuesArray[issueIndex].issueSummary, -1 * workLogArray[issueIndex][j].worklogTimeSpent);
                    //console.log("AJH WE DREMENTED ONE");
                }

                //Now reset the entry
                workLogArray[issueIndex][j] = worklogObect;       
            }
        }
    }         


    /****************
    Fetch for issues failed -
    ****************/    
    function onFetchError(error) {
        // hide main loading spinner
        toggleVisibility('div[id=loader-container]');
        genericResponseError(error);
    }

    /****************
    Worklog functions
    ****************/

    // Fetch and refresh worklog row - this is called on initiali laod and when a worklog has been update to refresh that row
    function getWorklogs(issueId, inputIssueIndex) {

        var loader = document.getElementById('loader');

        // show loading
        loader.style.display = 'block';

        //Should maybe re-intailize work log array
        initiatlizeWorklogArray(issueId, inputIssueIndex); //We are rebuilding the row in the array, but what is the issue index?
 
        //And also the input value elements
        for (i=0; i<7; i++) {
            var timeInput = document.getElementById(inputIssueIndex + "+" + i);
            if (timeInput) {
                timeInput.value = 0;
            }
        }

        //console.log("POP UP: Getting work logs enter after:" + firstDay);

        // Fetch worklogs for this issue
        // Have to use this API for gettign dated worklogs: api/3/issue/LET-3/worklog?startedAfter=1585338196000
        // Where the startedAfter is date in UNIX timestamp.  ex: "1585872000000".  Can do this with getTime() / 1000
        // This fires off asynchronous call...so the success/error functions dont get called right away
        JIRA.getIssueWorklogs(issueId, firstDay.getTime() / 1000)
            .then(onWorklogFetchSuccess, onWorklogFetchError);

        //Got worklog successful
        function onWorklogFetchSuccess(response) {
            // hide loading
            loader.style.display = 'none';

            //Async with buttons may make this not exist
            if (typeof issuesArray[inputIssueIndex] === 'undefined') {
                //does not exist
                return;
            }

            issuesArray[inputIssueIndex].issueTotalTime = 0;

            //For each worklog, see if it is before our end date, and if so, add it to our inventory
            response.worklogs.forEach(function(worklog) {
                
                var dayIndex;
                var myTimeLogDateStarted = new Date(worklog.started);

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

                            //showWorkLogObject("SHOWING: (" + inputIssueIndex + ", " + dayIndex + ") = ", workLogArray[inputIssueIndex][dayIndex]);                                 
                        }
                    
                    }
  
                }
                //console.log("PUP UP: TOTAL TIME is:" + issueTotalTime);
                
                //Now update the HTML for the total
                //console.log("Setting total time to:" + issuesArray[inputIssueIndex].issueTotalTime);
     //           document.getElementById(inputIssueIndex + "+total").innerText = issuesArray[inputIssueIndex].issueTotalTime;
  
            });          

        }

        //Got worklog failed
        function onWorklogFetchError(error) {
            // hide loading inspite the error
            loader.style.display = 'none';
            genericResponseError(error);

        }
        //console.log("PUP UP: Done getting worklogs");
      
    }

    //Value change handler - when update happens, post it back to Jira
    function postWorklogTimeChange(worklogChangeItem) {

        var blnValid = true;  //Boolean to hold validity flag for the entry
  
        //Reset if any error message was set
        notificationMessage("", "notification");

        //console.log("POP UP SYNC: UPDATING THIS ISSUE/DAY INDEX:" + worklogChangeItem.id);
        //console.dir(worklogChangeItem);

        var idParts = worklogChangeItem.id.split("+");
        var issueIndex = idParts[0];
        var workLogIndex = idParts[1];
        var workLogObject = workLogArray[issueIndex][workLogIndex];

        //console.log("UPD ISSUE ID: "+ workLogObject.worklogIssueId + " WORKLOG ID: " + workLogObject.worklogId + " TIME STARTED: " + workLogObject.worklogTimeStarted + " TIME SPENT: " + workLogObject.worklogTimeSpent + " COMMENT: " + workLogObject.worklogComment + " DAY OF WEEK: " + workLogObject.worklogDayOfWeek);
      
        //Validate it first
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
           return;
        }

        if (blnValid) {

            //turn it blue as we are updating it...
            worklogChangeItem.style.color = "#0000ff";

            //Here we post the update
            //FYI - Call for updating worklog is: PUT /rest/api/2/issue/{issueIdOrKey}/worklog/{id}
      
            //Show spinner while we update
            toggleVisibility('div[id=loader-container]');   

            //Call to Jir to update thee worklog - actaully always will add an new work log with delta of time incremented
            //This may not work if you go down in hours for adjustment.  May want to change this to an actual update, unless is a new time slot not filled
            JIRA.updateWorklog(workLogObject.worklogIssueId, workLogObject.worklogId, workLogObject.worklogComment, worklogChangeItem.value, getStartedTime(workLogObject.worklogTimeStarted))
                .then(function(data) {
                //Success
                notificationMessage("Success - " + workLogObject.worklogTimeStarted + " for " + worklogChangeItem.value, "notification");

                //When posted successfully, turn to blue
                worklogChangeItem.style.color = "#0000ff";

                //console.log("POP UP SYNCH: Updated worklog");

                //now update the issue row we updated
                getWorklogs(workLogObject.worklogIssueId, issueIndex);

                //console.log("POP UP SYNCH: Re-set the worklogs");

             }, function(error) {
                //Failure
                genericResponseError(error);
            });
            
           //"worklogIssueId": 
           //"worklogId": 
           //"worklogTimeStarted": 
           //"worklogTimeSpent": 
           //"worklogComment": 
           //"worklogDayOfWeek": 

           //Maybe need to refresh or update the totals? Turn spinner off
            toggleVisibility('div[id=loader-container]');   
 
        }
        else {
            worklogChangeItem.style.color = "#ff0000";
            worklogChangeItem.focus();
        }
    }    

    //Pushing time card thru the process by updating all of the status on the worlogs
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

    //Update the status of all of the worklogs for this time card
    function updateTimecardStatus(fromStatus, toStatus) {

        var workLogObject;
        for (var i = 0; i <= issuesArrayIndex; i++) {
            for (var j = 0; j < 7; j++) {
                workLogObject = workLogArray[i][j];
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
            }                    
        }
    }

    //Set all of the worklog entry fields enabled/disabled based on status
    function setWorklogEnabled(inputEnabled) {
 
        var workLogEntry;
        for (var i = 0; i <= issuesArrayIndex; i++) {
            for (var j = 0; j < 7; j++) {
                workLogEntry = document.getElementById(i + "+" + j);
                if (workLogEntry.disabled != !inputEnabled) {
                    workLogEntry.disabled = !inputEnabled;
                }
            }                    
        }
    }
    

    /***************
    HTML interaction
    ****************/

    //Disable the UI elements while we are processing
    function toggleInteractive(inputValue) {
        if (!inputValue) {
            document.getElementById('previousWeek').onclick = doNothing;
            document.getElementById('nextWeek').onclick = doNothing;
            document.getElementById('closeLink').doNothing;
            notificationMessage(startMessage, "notification");
            blnInteractive = false;
        }
        else {
            document.getElementById('previousWeek').onclick = previousWeek;
            document.getElementById('nextWeek').onclick = nextWeek;
            document.getElementById('closeLink').doNothing;
            blnInteractive = true;
        }
    }

    //Turn processing wheel on and off
    function toggleVisibility(query) {
        var element = document.querySelector(query);
        element.style.display = element.style.display == 'block' ? 'none' : 'block';
    }

    //Build and show the Issues list table
    function drawIssuesTable(issues) {

        var issueIndex = 0;

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
            var row = generateLogTableRow(issue.key, issue.fields.summary, reportingGroup, issueIndex);
            issueIndex++;

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

    //Toggle the admin, for testing
    function toggleAdmin() {
        if (blnAdmin)
            blnAdmin = false;
        else    
            blnAdmin = true;
        alert("Admin is: " + blnAdmin);
        return false;

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

    //For the issues list table, generate each html element here
    function generateLogTableRow(id, summary, timeReportingGroup, issueIndex) {

        /********
        Issue row - define here and add stuff to it
        ********/
        var row = buildHTML('tr', null, {
            'data-issue-id': id,
            class: 'collapsible'
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
                timeInputDay.value = workLogArray[issueIndex][i].worklogTimeSpent;
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
    buildJQL - for a given user, the long query to grab all the right issues
    ********************/
    function buildJQL(inputName) {

        jql = "assignee='" + inputName + "' or "
        jql = jql + "issueKey in IssueHistory() or "
        jql = jql + "issueKey in updatedBy('" + inputName + "', '-3w', '1d') or "
        jql = jql + "watcher = '" + inputName + "' or "
        jql = jql + "type = internal " 
        jql = jql + "order by updated"
      
        console.log("LE-TIME JQL: " + jql);
        JIRA.setJQL(jql);
    }

    /********************
    Inncrement the reporting group counters
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


    //Initialize the reporting group buckets
    function initializeReportingGroups() {
        document.getElementById("total-support").innerText = "";
        document.getElementById("total-admin").innerText = "";
        document.getElementById("total-run-the-business").innerText = "";
        document.getElementById("total-project").innerText = "";       

        document.getElementById("total-support-percent").innerText = "1";
        document.getElementById("total-admin-percent").innerText = "2";
        document.getElementById("total-run-the-business-percent").innerText = "3";
        document.getElementById("total-project-percent").innerText = "4";    
    }

    /********************
    Log time button click - NOT USED
    ********************/

    function logTimeClick(evt) {

        // clear any error messages
        notificationMessage('', "notification");

        //console.log("POP UP: Logging some time");

        // get issue ID
        var issueId = evt.target.getAttribute('data-issue-id')

        // time input
        var timeInput = document.querySelector('input[data-issue-id=' + issueId + ']');
        // date input
        var dateInput = document.querySelector('input[class=issue-log-date-input][data-issue-id=' + issueId + ']');

        // validate time input
        if (!timeInput.value.match(/[0-9]{1,4}[wdhm]/g)) {
            notificationMessage('Time input in wrong format. You can specify a time unit after a time value "X", such as Xw, Xd, Xh or Xm, to represent weeks (w), days (d), hours (h) and minutes (m), respectively.', "error");
            return;
        }

        // hide total time and show loading spinner;
        toggleVisibility('div[class="issue-total-time-spent"][data-issue-id=' + issueId + ']');
        toggleVisibility('div[class="loader-mini"][data-issue-id=' + issueId + ']');

        var startedTime = getStartedTime(dateInput.value);

        /* For posting comment to the TimeLog entry, have to do this:
        {
                "started":"2020-04-09T13:45:16.259-0500",
                "timeSpent":"2h",
                "comment":
                {
                    "version": 1,
                    "type": "doc",
                    "content":
                        [{"type": "paragraph","content":
                            [{"type": "text", "text": "Test Comment" }]
                        }]
                }
                }
        */

        JIRA.updateWorklog(issueId, timeInput.value, startedTime)
            .then(function(data) {
                getWorklogs(issueId);
            }, function(error) {
                // hide total time and show loading spinner;
                toggleVisibility('div[class="issue-total-time-spent"][data-issue-id=' + issueId + ']');
                toggleVisibility('div[class="loader-mini"][data-issue-id=' + issueId + ']');
                genericResponseError(error);
            });

    }

    /***************
    Show WOrklog Object
    ***************/
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

        //I want the first day to start at midnight, and last day to end 1 sec before midnight

        //console.log("PUP UP TIME:" + firstDay + " " + lastDay);
        //console.log(makeDateString(firstDay), makeDateString(lastDay));
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

        //Make screen not interactive while we process
        toggleInteractive(false);

        offset = offset - 1;
 
        getWeek(offset);
        
        //Changed the week, so reset everything
        getTheIssues();

        return false; //This causes the href to not get invoked
    }
      
    //Rotate forward 1 week
    function nextWeek() {

        //Make screen not interactive while we process
        toggleInteractive(false);

        offset = offset + 1;
 
        getWeek(offset);
         
        //Changed the week, so reset everything
        getTheIssues();

        return false; //This causes the href to not get invoked
    }

    //Do nthing....
    function doNothing() {
        return false;
    }

    /***************
    Helper functions 
    ***************/

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

    // Listen to global events and show/hide main loading spiner
    // ** NOT USED AT THE MOMENT **
    function initLoader() {
        // Popup loading indicator
        var indicator = document.getElementById('loader-container');

        document.addEventListener('jiraStart', function() {
            indicator.style.display = 'block';
        }, false);

        document.addEventListener('jiraStop', function() {
            indicator.style.display = 'none';
        }, false);

    }

}

// Get Query String parameter
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
};

