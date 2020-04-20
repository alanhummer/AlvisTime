/****************
This JS is the main processing set - when DOM loaded, code is fired to get, display, process JIRA time entries
****************/
const weekDescription = "";
const baseUrl = "https://letime.atlassian.net";
const apiExtension = "/rest/api/2";
const jql = "assignee=currentUser()";

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

//Is the screen interactive, used for toggle
var blnInteractive = true;

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


document.addEventListener('DOMContentLoaded', onDOMContentLoaded, false);

/****************
Main control thread - When document loaded, do this routine
****************/
function onDOMContentLoaded() {

    //Setup message
    notificationMessage("Enter time in 1/4 hour increments", "notification");

    // show main loading spinner
    toggleVisibility('div[id=loader-container]');    

    var JIRA = JiraAPI(baseUrl, apiExtension, jql);

    console.log("LE-TIME API Endpoint: " + baseUrl + apiExtension);

    //Close Button
    document.getElementById('closeLink').href = "nowhere";
    document.getElementById('closeLink').onclick = closeit;

    //Previous and next buttons
    document.getElementById('previousWeek').href = "nowhere";
    document.getElementById('previousWeek').onclick = previousWeek;
    document.getElementById('nextWeek').href = "nowhere";
    document.getElementById('nextWeek').onclick = nextWeek;  

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
        console.log("LE-TIME User:" + userId + " - " + userEmail);
    }

    /****************
    Fetch for user failed -
    ****************/    
    function onUserError(error) {
        console.log("LE-TIME Failed to get user:" + error);
        genericResponseError(error);
    }

    getTheIssues();

    /****************
    This does all the calling - restarts everything up
    ****************/       
    function getTheIssues() {

        //Initialize
        workLogArray = [];
        workLogArrayIndex = -1;
        issuesArray = [];
        issuesArrayIndex = -1;

        //Clear the issue table out - on date forward/backward have to start over
        var issuesTableBody = document.getElementById("issues-table-body");
        if (issuesTableBody)
            issuesTableBody.parentNode.removeChild(issuesTableBody);
        
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
                "issueTotalTime": 0
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

                            //Add to the day totals also - AJH THIS NEVER REINITIALIZEDS, SO WAY OFF WHEN ADDING UP DAY TOTALS
                            document.getElementById("total+" + dayIndex).innerText = Number(document.getElementById("total+" + dayIndex).innerText) + workLogArray[inputIssueIndex][dayIndex].worklogTimeSpent

                            //And we have totals to add up also
                            document.getElementById("total+total").innerText = Number(document.getElementById("total+total").innerText) + workLogArray[inputIssueIndex][dayIndex].worklogTimeSpent     
                            
                            if (document.getElementById("total+total").innerText >= 40) {
                                document.getElementById("total+total").style.backgroundColor = "green";
                            }


                            //showWorkLogObject("SHOWING: (" + inputIssueIndex + ", " + dayIndex + ") = ", workLogArray[inputIssueIndex][dayIndex]);                                 

                        }
                    
                    }
  
                }
                //console.log("PUP UP: TOTAL TIME is:" + issueTotalTime);
                
                //Now update the HTML for the total
                //console.log("Setting total time to:" + issuesArray[inputIssueIndex].issueTotalTime);
                document.getElementById(inputIssueIndex + "+total").innerText = issuesArray[inputIssueIndex].issueTotalTime;

                //Increment our total breakdown
                document.getElementById("total-breakdown").innerText = Number(document.getElementById("total-breakdown").innerText) + issuesArray[inputIssueIndex].issueTotalTime;
      
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

    /***************
    HTML interaction
    ****************/

    //Disable the UI elements while we are processing
    function toggleInteractive(inputValue) {
        if (!inputValue) {
            document.getElementById('previousWeek').onclick = doNothing;
            document.getElementById('nextWeek').onclick = doNothing;
            document.getElementById('closeLink').doNothing;
            notificationMessage("Enter time in 1/4 hour increments", "notification");
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

        var logTable = document.getElementById('jira-log-time-table');
        //var tbody = buildHTML('tbody');
        var tbody = buildHTML('tbody', null, {
            'id': 'issues-table-body'
        });        

        issues.forEach(function(issue) {
            var row = generateLogTableRow(issue.key, issue.fields.summary, issueIndex);
            issueIndex++;
            tbody.appendChild(row)
        });

        //Let's do a totals row
        var totalrow = generateLogTableRow("TOTAL", "", "total");
        tbody.appendChild(totalrow)    

        logTable.appendChild(tbody);
    }

    //Close the window when "Close Window" clicked
    function closeit(){
        window.close();
        return false; //This causes the href to not get invoked
    }

    //For the issues list table, generate each html element here
    function generateLogTableRow(id, summary, issueIndex) {

        /********
        Issue row - ddefine here and add stuff to it
        ********/
        var row = buildHTML('tr', null, {
            'data-issue-id': id
        });

        /************
        Issue summary
        ************/
        var summaryCell = buildHTML('td', summary, {
            class: 'issue-summary truncate'
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
                href: baseUrl + "/browse/" + id,
                target: "_blank"
            });

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
        notification.innerText = message;
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