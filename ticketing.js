
var UserProcessor = require('../lib/user_processor.js');
var schedule = require('node-schedule')
//Initialize firebase
var firebase = require("./firebase.js");
var database = firebase.database();

recipients = ["email1@company.com", "hello@foo.bar"];

//Initialize mailgun credentials
var api_key = 'testkey';
var domain = 'test.domain.com';
var mailgun = require('mailgun-js')({apiKey: api_key, domain: domain});

//Start function
exports.start = function(){
  console.log("Start daily email scheduling");//execute function schedule on init
  //Node-schedule works in UTC, so the offset must be four hours later than EST
  console.log(getRealDate(0));
  var job = schedule.scheduleJob('0 0 5 * * *', function() {
    console.log("Email sent");
    fetchTodaysRows(function(rows) {
      sendTodaysRows(rows);
    });
  });
}

//Have to do this because the asynchronous request to database doesn't finish before createHTML finishes
function fetchTodaysRows(callback){
  var rows = [];
  var index;
  //Make the dates generated variable to today's date - this is easy
  database.ref(getRealDate(0)).once('value', function(snapshot) {
    snapshot.forEach(function(order) {
      if ((index = lookup(order.child("broker_id").val(), rows)) != -1){
	//ticket_evolution
	if (order.child("market").val() == "ticket_evolution"){
	  rows[index].ticket_evolutiontotal += order.child("sale").val();
	  rows[index].ticket_evolutioncount ++;
	  //console.log(middles[index]);
	}
	//vivid seats
	else{
	  rows[index].vivid_seatstotal += order.child("sale").val();
	  rows[index].vivid_seatscount ++;
	  //console.log(middles[index]);
	}
      }
      else{
	//ticket_evolution
	if (order.child("market").val() == "ticket_evolution"){
	  rows.push({
	    broker_id: order.child("broker_id").val(),
	    ticket_evolutiontotal: order.child("sale").val(),
	    ticket_evolutioncount: 1,
	    vivid_seatstotal: 0,
	    vivid_seatscount: 0
	  });
	}
	//vivid seats
	else{
	  rows.push({
	    broker_id: order.child("broker_id").val(),
	    ticket_evolutiontotal: 0,
	    ticket_evolutioncount: 0,
	    vivid_seatstotal: order.child("sale").val(),
	    vivid_seatscount: 1
	  });
	}
      }
    });
    callback(rows);
  });

}

//This function makes the call to the database and runs something for every member of the database
function sendTodaysRows(rows){
  var header = '<html><body><h2>Auto Processor Daily Email Report</h2><div>TS = Ticket Evolution</div><div>VS = Vivid Seats</div><br><table border="0" align="left"><tr><th>Broker ID</th><th>Orders - TE</th><th>Sales -TE</th><th>Orders - VS</th><th>Sales - VS</th></tr>';
  //iterate over every key value pair in the dictionary
  rows.forEach(function(broker) {
    var middle = '<tr><td>'+ broker.broker_id + '</td><td>' + broker.ticket_evolutioncount + '</td><td>$' + (Math.round(broker.ticket_evolutiontotal * 100) / 100).toFixed(2) + '</td><td>' + broker.vivid_seatscount + '</td><td>$'+ (Math.round(broker.vivid_seatstotal * 100) / 100).toFixed(2) + '</td></tr>';
    header += middle;
  });
  var footer = '</table></body></html>';
  //finalize HTML
  var HTML = header + footer;
  //Send mailgun
  for (var i = 0; i < 3; i ++){
    console.log("Sending to " + recipients[i])
    var data = {
      from: 'TN Test <me@samples.mailgun.org>',
      to: recipients[i],
      subject: 'Today\'s Sales',
      html: HTML,
      //"o:deliverytime": getRealDate(1)
    }
    mailgun.messages().send(data, function (error, body) {
      console.log(body);
    });
  }
}


//checks if our broker already exists in the array, if exists then return the array value
function lookup(name, arr) {
  for(var i = 0, len = arr.length; i < len; i++) {
    if(arr[i].broker_id == name)
      return i;
  }
  return -1;
}


//Outputs the date in the format that maligun needs - 1 for mailgun, 0 for filepath, note that 1 is now obsolete, and when we get 0 for the filepath, we are getting it for the day after (since the email now sends at very early the next morning in order to get every single order for the day before)
function getRealDate(type){
  var objToday = new Date()
  objToday.setDate(objToday.getDate() - 1);
  weekday = new Array('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday');
  dayOfWeek = weekday[objToday.getDay()];
  dayOfMonth = objToday.getDate();
  months = new Array('January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December');
  curMonth = months[objToday.getMonth()];
  curYear = objToday.getFullYear();
  if (type == 1){
    var offset = objToday.getTimezoneOffset();
    //console.log(offset);
    if (offset <= 0){
      if (offset.toString().length == 4){
	offset = '+0' + offset;
      }
      else{
	offset = '+' + offset;
      }
    }
    else if (offset.toString().length == 3){
      offset = '-0' + offset;
    }
    else{
      offset = '-' + offset;
    }
    var today = dayOfWeek.substring(0,3) + ', ' + dayOfMonth + ' ' + curMonth.substring(0,3) + ' ' + curYear + ' 23:59:59 ' + createOffset(objToday);
    //Note: Timezone is minute specific and not hour specific, also need some way to bugtest diff time zones.
    return today;
  }
  else{
    var today = "dates/" + (objToday.getMonth() + 1) + "-" + dayOfMonth + "-" + (curYear - 2000) + "/";
    return today;
  }
}

function pad(value) {
  return value < 10 ? '0' + value : value;
}
function createOffset(date) {
  var sign = (date.getTimezoneOffset() > 0) ? "-" : "+";
  var offset = Math.abs(date.getTimezoneOffset());
  var hours = pad(Math.floor(offset / 60));
  var minutes = pad(offset % 60);
  return sign + hours + minutes;
}
