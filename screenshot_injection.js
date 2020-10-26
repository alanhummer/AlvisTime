/****************
This Script will take a screen shot of the page and open email client to paste it in for sending
Alternative to screenshot, here we take picture and save info off to a .eml file, then download it.  WHen you lick it then, Outlook loads
****************/ 
console.log("Alvis Time: Screenshot Injection Script is loaded");

window.resizeTo(800, 600);

//Now get our data to poast
chrome.storage.local.get("screenshotData", function(data) {
    console.log("Alvis Time: Got screenshotData from local storage");
    console.log(data);

    if (data) {
        console.log("Alvis Time: Completing a post for: " + data.screenshotData.emailAddress + " = " + data.screenshotData.pageToLoad);
        //Call back to backgrhound script ge the screenshot
        
        if (data.screenshotData.takeScreenshot) {
            console.log("Alvist Time: Takings Screenshot");
            chrome.runtime.sendMessage({action: "takescreenshot"}, function(response) {
                console.log("Alvis Time: Got a reply back message");
                if (response.imgSrc) {
                    //Got all the info, build the email
                    console.log("Alvis Time: Has data so doing email");
                    createEML(data.screenshotData, response.imgSrc);
                }
            });
        }
        else {
            console.log("Alvist Time: Not Taking Screenshot");
        }

        //Now we can do form entry actions - toggle checkboxes on for approving, appprove, whatever
        doFormEntry();

    }
});

//Build the EML file from the screenshot data and image and then download it
function createEML(screenshotData, inputImage) {

    //Now build EML file
    var emlContent = "data:message/rfc822 eml;charset=utf-8,";
    emlContent += 'To: '+screenshotData.emailAddress+'\n';
    emlContent += 'Subject: '+screenshotData.subject+'\n';
    emlContent += 'X-Unsent: 1'+'\n';
    emlContent += 'Content-Type: text/html'+'\n';
    emlContent += ''+'\n';
    emlContent += screenshotData.body + '<br><br><img width="20" height="50" src="' + inputImage + '">';
    emlContent += ''+'\n';
    emlContent += ''+'\n';

    console.log("Alvis Time: FInal state of email creation");
    
    var encodedUri = encodeURI(emlContent); //encode spaces etc like a url
    var a = document.createElement('a'); //make a link in document
    var linkText = document.createTextNode("fileLink");
    a.appendChild(linkText);
    a.href = encodedUri;
    a.id = 'fileLink';
    a.download = screenshotData.date + '_' + screenshotData.name.replace(' ', '_') + '.eml';
    a.style = "display:none;"; //hidden link
    document.body.appendChild(a);
    document.getElementById('fileLink').click(); //click the link

}

//Do Form Entry
function doFormEntry() {
    
    var savedCell = "";
    var totalHours = 0;

    //1) Get TABLE by ID time_card_table
    //2) Get earch row in the table or by id- row_time_card_ <guid> , matchs sys_id guid, matches - Save teh GUID and use it
    //3) Get each column in the row - first is checkbox - id="check_time_card_<guid> OR GET CHECKBOX ID check_time_card_<guid>
    //4) Turn checkbox on 

    console.log("Alvis Time: Doing form entry");

    //Rip thru table cells looking for our task
    var table = this.document.getElementById("time_card_table");
    for (var i = 0; i < table.rows.length; i++) {
        //If row has a class id like row_time_card_ our id is that guild
        if(table.rows[i].id) {
            if (table.rows[i].id.indexOf("row_time_card_") >= 0) {
                var ourRowID = table.rows[i].id.replace("row_time_card_", "");
                console.log("Alvis Time: We have a entry row, so processing: " + ourRowID);
                var checkBox = this.document.getElementById("check_time_card_" + ourRowID);
                console.log("Alvis Time: We have eyes on checkbox. It is - ", JSON.parse(JSON.stringify(checkBox)));
         
                //Go thru columms, 2nd to last is our total
                totalHours = 0;
                savedCell = "";
                console.log("Alvis Time: Numbers of Cells is: " + table.rows[i].cells.length);
                for (var j = 0; j < table.rows[i].cells.length; j++) {
                    if (j == table.rows[i].cells.length - 1) {
                        //Our last entry, so prior must be total
                        totalHours = savedCell;
                    }
                    else {
                        savedCell = table.rows[i].cells[j].innerHTML;
                    }
                }
                //See if we should enble or not
                console.log("Alvis Time: Total for " + ourRowID + " is " + totalHours); 
                if (totalHours > 0) {
                    checkBox.checked = true;
                }  
                else {
                    checkBox.checked = false;                    
                }
            }
        }
    }
}