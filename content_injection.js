/****************
This Script will take a time entry frm local storate and post into SN via the web page - dropping in all of the data elements and pushing the button
****************/ 
console.log("Alvis Time: Content Injection Script is loaded");

chrome.storage.local.get("timeEntry", function(data) {
    console.log("Alvis Time: Got Time Entry Object from local storage");
    console.log(data);

    if (data) {
        console.log("Alvis Time: Completing a post for: " + data.timeEntry.description + " = " + data.timeEntry.totalTotal);
        postTimeEntry(data.timeEntry);
    }

});


/****************
postTimeEntry - do the page update and push the button
****************/    
function postTimeEntry(inputTimeEntry) {

    //Set user ID
    document.getElementById('sys_display.time_card.user').value = inputTimeEntry.userId;
 
    //Lets see if we can choose a week
    document.getElementById('time_card.week_starts_on').value = inputTimeEntry.weekOf;

    //Get project number
    var projectNumber = getJustNumbers(inputTimeEntry.description);

    //Get task description
    var projectTask = getNoNumbers(inputTimeEntry.descriptionChild);
    if (projectTask.length <= 1) 
        projectTask = "Development";
    if (projectTask == "Process, Procedures, Standards") 
        projectTask = "Processes, Procedures, and Standards";
    if (projectTask == "Checkout") 
        projectTask = "Development";
    if (projectTask == "Management & Supervision")
        projectTask = "Supervision";
    

    //Pick from the drop down list    
    switch(projectNumber) {
        case "10558": //Run the business
            document.getElementById('time_card.u_category').selectedIndex = 4;
            break;
        case "10705": //Support
            document.getElementById('time_card.u_category').selectedIndex = 2;
            break;
        case "10345": //Administration
            document.getElementById('time_card.u_category').selectedIndex = 3;
            break;
        default: //Projects
            document.getElementById('time_card.u_category').selectedIndex = 1;
            break;
    }

    //Set the daily hours
    document.getElementById('time_card.saturday').value = inputTimeEntry.dayPostedTotal[0];
    document.getElementById('time_card.sunday').value = inputTimeEntry.dayPostedTotal[1];
    document.getElementById('time_card.monday').value = inputTimeEntry.dayPostedTotal[2];
    document.getElementById('time_card.tuesday').value = inputTimeEntry.dayPostedTotal[3];
    document.getElementById('time_card.wednesday').value = inputTimeEntry.dayPostedTotal[4];
    document.getElementById('time_card.thursday').value = inputTimeEntry.dayPostedTotal[5];
    document.getElementById('time_card.friday').value = inputTimeEntry.dayPostedTotal[6];

    //Select our project and task from the popup window
    doProjectAndTaskSelectors(projectNumber, projectTask); //Which also calls task selector

}

/****************
doProjectAndTaskSelectors - Push the botton and select the project from the list, then do task
****************/    
function doProjectAndTaskSelectors (inputProjectNumber, inputProjectTask) {

    var blnFoundProject = false;

    //Choose the right project, ex: Adobe Launch USD CPR 20-002 - 1) click the button 2) find the project id 3) click it
    document.getElementById('lookup.time_card.u_project').click();
    var projectList = window.open('', 'lookup');

    //When it is loaded, find our selection
    projectList.onload = function () {

        //See if we have links
        if (this.document.querySelectorAll('a.glide_ref_item_link').length > 0) {

            //Find the project id in the links
            let linkElements = this.document.querySelectorAll('a.glide_ref_item_link');
            for (let elem of linkElements) {
                if (elem.text == "PRJ00" + inputProjectNumber) {
                    blnFoundProject = true;
                    console.log("Alvis Time: Chose Project " + elem.text);
                    elem.click();
                    break;
                }
            }
            //If we found a prject, continue with task
            if (blnFoundProject) {
                doTaskSelector(inputProjectTask);
            }
            else {
                //Did not find one, what to do?
                alert("Could not find project for PRJ00" + inputProjectNumber);
                console.log("Alvis Time: Could not find project for: " + "PRJ00" + inputProjectNumber);
                return;
            }
        }
        else {
            console.log("Alvis Time: Project window does not have links");
        }        
    }

    console.log("Alvist Time: Project end of function");

}

/****************
doTaskSelector - Push the botton and select the TASK from the list
****************/   
function doTaskSelector(inputProjectTask) {

    var blnFoundTask = false;

    //There is a delay in here while project feild gets updated
    var projectTaskInterval = setInterval(function() {
        if (document.getElementById('sys_display.time_card.u_project').value.length > 0) {
            
            //Project loaded, so stop the loop
            clearInterval(projectTaskInterval);

            //Works better with a brief delay here
            sleep(1000);

            //Have project entered, get the task window
            document.getElementById('lookup.time_card.u_project_task').click();
            var projectTaskList = window.open('', 'lookup');

            //When it is loaded, find our selection
            projectTaskList.onload = function () {

                //Works better with a brief delay here
                sleep(1000);
                
                //Rip thru table cells looking for our task
                var table = this.document.getElementById("pm_project_task_table");
                for (var i = 0; i < table.rows.length; i++) {
                    for (var j = 0; j < table.rows[i].cells.length; j++) {
                        if (table.rows[i].cells[j].querySelector('a')) {
                            saveAnchor = table.rows[i].cells[j].querySelector('a');
                        }
                        else {
                            if (table.rows[i].cells[j].innerHTML.includes(inputProjectTask)) {

                                //We found our task, lets select it and be done
                                blnFoundTask = true;
                                console.log("Alvis Time: Found task " + table.rows[i].cells[j].innerHTML);
                                saveAnchor.click();
                                break;
                            }
                        }
                    }  
                }
                if (blnFoundTask) {
                    //We found task and project and we are all set.  Let's post the form
                    postForm();
                }
                else {
                    //Did not find one, what to do?
                    alert("Could not find task for : " + inputProjectTask);
                    return;
                }
            }
        }
    }, 1000);

    console.log("Alvis time: Task selector end of function");

}

/****************
postForm - We are done so lets clean up and submit
****************/   
function postForm() {

    var submitInterval = setInterval(function() {
        if (document.getElementById('sys_display.time_card.u_project_task').value.length > 0) {

            //Task found, so stop the loop
            clearInterval(submitInterval);

            //Remove the local storage object - we are done with it
            chrome.storage.local.remove(["timeEntry"], function() {
                var error = chrome.runtime.lastError;
                if (error) {
                    console.error(error);
                }
            });
            //alert("WE DID IT!");
            document.getElementById('sysverb_insert_bottom').click();
            sleep(1000);
        }
    }, 1000);
}


/****************
getJustNumbers - return number only portion of the string
****************/   
function getJustNumbers(inputString) {
    var theResult;
    theResult = inputString.match(/\d+/)[0];
    return theResult;
}

/****************
getNoNumbers - return non-number only portion of the string
****************/   
function getNoNumbers(inputString) {

    var blnDoThRest = false;
    var theResult = "";
    var someLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    //Trim everything that is not a letter from the front
    for (i=0;i<inputString.length;i++) {
        if (blnDoThRest || someLetters.includes(inputString.charAt(i).toUpperCase())) {
            theResult = theResult + inputString.charAt(i);
            blnDoThRest = true;
        }
    }
    return theResult;
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
