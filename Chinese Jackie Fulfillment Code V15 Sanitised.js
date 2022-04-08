// TK: ver15 Jackie Hair Salon Chinese Version

// Feedback Intent and Firestore FeedbackDB - Working
// Fulfillment triggered FollowupEvent SuccessAppt and FailureAppt Intent - Working
// Loop BAck to Make Appointment Intent from Change Stylist - Working
// OrderShampoo intent and AddShampoo Intent - Working
// Delete appointment, SuccessDeleteAppt and FailureDeleteAppt - Working
// Deletion only for the designated customer name - Working
// Date formats all converted to dd-mm-yyyy formats for storing to datebase - Working
// Email Sending function at Order Shampoo -Working
// Email notification to customer for make appt, delete appt and order shampoo

// Intents served by Fulfillment Code:
//      Intent 'MakeAppt' => makeAppointment
//      Intent 'GiveFeedBack' => GiveFeedBackHandler
//      Intent 'ChangeStylist'=> makeAppointment
//      Intent 'ChangeDateTime' => makeAppointment
//      Intent 'ChangeTime' => makeAppointment
//      Intent 'OrderShampoo' => ShampooHandler
//      Intent 'AddShampoo' => ShampooHandler
//      Intent 'DeleteAppt' => DeleteApptHandler

'use strict';

const functions = require('firebase-functions');
const { google } = require('googleapis');
const { WebhookClient } = require('dialogflow-fulfillment');

// Firstore DB Configuration
// Require "firebase-admin": "^8.2.0" dependency at package json
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// Email & Nodemailer Configuration
// Require "nodemailer": "^4.6.7" dependency at package json
// ChatbotEmail needs less secure setting at Google Account
const ChatbotEmail = 'xxx@gmail.com'; //For chatbot send out confirmation emails
const FulfillmentEmail = 'xxx@gmail.com'; //For Shampoo Fulfillment Team receive emails
const nodemailer = require('nodemailer');
const mailTransport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: '465',
    secure: 'true',
    service: 'Gmail',
    auth: {
        user: ChatbotEmail,
        pass: 'xxx'     // Insert password to Chatbot Email here
    }
});

// Google Calendar Configuration
// Calendar ID from shared Google Calendar  
const CalendarIdJackie = "xxx@group.calendar.google.com";
const CalendarIdSamantha = "xxx@group.calendar.google.com";
const CalendarIdBrian = "xxx@group.calendar.google.com";

// JSON File downloaded from Google Calendar Service Acct create credentials
// Starting with "type": "service_account"... 
const serviceAccount = {
    "type": "service_account", "...": "..."
};
const serviceAccountAuth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: 'https://www.googleapis.com/auth/calendar'
});
const calendar = google.calendar('v3');
const timeZoneOffset = '+08:00';

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({ request, response });

    function makeAppointment(agent) {
        // Calculate appointment start and end datetimes (end = +1hr from start)
        const AppointmentDate = agent.parameters.Date.split('T')[0];
        const AppointmentTime = agent.parameters.Time.split('T')[1].substr(0, 8);
        const dateTimeStart = new Date(AppointmentDate + 'T' + AppointmentTime + timeZoneOffset);
        const dateTimeEnd = new Date(new Date(dateTimeStart).setHours(dateTimeStart.getHours() + 1));
        const appointment_type = agent.parameters.CustName + ' ' + agent.parameters.CustMobile + ' ' + agent.parameters.Service;
        var CalendarId;
        var Stylist;
        Stylist = agent.parameters.Stylist;
        if (Stylist == "Jackie") { CalendarId = CalendarIdJackie; }
        if (Stylist == "Samantha") { CalendarId = CalendarIdSamantha; }
        if (Stylist == "Brian") { CalendarId = CalendarIdBrian; }

        const CustName = agent.parameters.CustName;
        const CustEmail = agent.parameters.CustEmail;

        // Email Notification to Customer    
        const EmailSubject = '预约洁琪美容院服务通知';
        const EmailBody = '尊敬的客户' + CustName +
            '<p> 非常感谢您的预约。' +
            '<p> 您的预约详情如下：' +
            '<p><strong> 客户名字: </strong>' + CustName +
            '<br><strong> 预约服务日期和时间: </strong>' + AppointmentDate.split('-').reverse().join('-') + ' ' + AppointmentTime.substr(0, 5) +
            '<br><strong> 美容师名字: </strong>' + Stylist +
            '<p> 非常感谢您对我们洁琪美容院的支持和关怀。我们期待着早日在美容院与您相见。' +
            '<p> 祝您有美好的一天！' +
            '<p> 发至于：洁琪美容院人工智能机器人';

        // Check the availibility of the time, and make an appointment if there is time on the calendar
        return createCalendarEvent(dateTimeStart, dateTimeEnd, appointment_type, CalendarId).then(() => {
            sendEmail(CustEmail, EmailSubject, EmailBody);
            agent.add(`Let me see if we can fit you in for ${Stylist} on ${AppointmentDate} at ${AppointmentTime}! Yes It is fine!.`);
            agent.setFollowupEvent('SuccessAppt');
        }).catch(() => {
            agent.add(`I'm sorry, there are no slots available for ${Stylist} on ${AppointmentDate} at ${AppointmentTime}.`);
            agent.setFollowupEvent('FailureAppt');
        });
    }

    function createCalendarEvent(dateTimeStart, dateTimeEnd, appointment_type, CalendarId) {
        return new Promise((resolve, reject) => {
            calendar.events.list({
                auth: serviceAccountAuth, // List events for time period
                calendarId: CalendarId,
                timeMin: dateTimeStart.toISOString(),
                timeMax: dateTimeEnd.toISOString()
            }, (err, calendarResponse) => {
                // Check if there is a event already on the Calendar
                if (err || calendarResponse.data.items.length > 0) {
                    reject(err || new Error('Requested time conflicts with another appointment'));
                } else {
                    // Create event for the requested time period
                    calendar.events.insert({
                        auth: serviceAccountAuth,
                        calendarId: CalendarId,
                        resource: {
                            summary: appointment_type + ' Appointment', description: appointment_type,
                            start: { dateTime: dateTimeStart },
                            end: { dateTime: dateTimeEnd }
                        }
                    }, (err, event) => {
                        err ? reject(err) : resolve(event);
                    }
                    );
                }
            });
        });
    }

    function DeleteApptHandler(agent) {
        // Calculate appointment start and end datetimes (end = +1hr from start)
        const CustName = agent.parameters.CustName;
        const AppointmentDate = agent.parameters.Date.split('T')[0];
        const AppointmentTime = agent.parameters.Time.split('T')[1].substr(0, 8);
        const dateTimeStart = new Date(AppointmentDate + 'T' + AppointmentTime + timeZoneOffset);
        const dateTimeEnd = new Date(new Date(dateTimeStart).setHours(dateTimeStart.getHours() + 1));

        var CalendarId;
        var Stylist;
        Stylist = agent.parameters.Stylist;
        if (Stylist == "Jackie") { CalendarId = CalendarIdJackie; }
        if (Stylist == "Samantha") { CalendarId = CalendarIdSamantha; }
        if (Stylist == "Brian") { CalendarId = CalendarIdBrian; }

        const CustEmail = agent.parameters.CustEmail;

        // Email Notification to Customer    
        const EmailSubject = '取消预约洁琪美容院服务通知';
        const EmailBody = '尊敬的客户' + CustName +
            '<p> 非常感谢您联络我们关于您取消预约。' +
            '<p> 您的预约已经成功取消，详情如下：' +
            '<p><strong> 客户名字: </strong>' + CustName +
            '<br><strong> 预约服务日期和时间: </strong>' + AppointmentDate.split('-').reverse().join('-') + ' ' + AppointmentTime.substr(0, 5) +
            '<br><strong> 美容师名字: </strong>' + Stylist +
            '<p> 非常感谢您对我们洁琪美容院的支持和关怀。我们期待着早日在美容院与您相见。' +
            '<p> 祝您有美好的一天！' +
            '<p> 发至于：洁琪美容院人工智能机器人';

        // Check if customer indeed made the appointment and delete calendar event accordingly
        return deleteCalendarEvent(CustName, dateTimeStart, dateTimeEnd, CalendarId).then(() => {
            sendEmail(CustEmail, EmailSubject, EmailBody);
            agent.add(`Appointment Deleted`);
            agent.setFollowupEvent('SuccessDeleteAppt');
        }).catch(() => {
            agent.add(`No appointment found in requested time`);
            agent.setFollowupEvent('FailureDeleteAppt');
        });
    }

    function deleteCalendarEvent(CustName, dateTimeStart, dateTimeEnd, CalendarId) {
        return new Promise((resolve, reject) => {
            calendar.events.list({
                auth: serviceAccountAuth, // List events for time period
                calendarId: CalendarId,
                timeMin: dateTimeStart.toISOString(),
                timeMax: dateTimeEnd.toISOString()
            }, (err, calendarResponse) => {
                // Check if there is a event on the Calendar
                if (calendarResponse.data.items.length != 0) {
                    var ApptSummary = calendarResponse.data.items[0].summary;
                    var ApptCustName = ApptSummary.split(" ")[0];
                }
                if (err || (calendarResponse.data.items.length == 0) || (ApptCustName != CustName)) {
                    reject(err || new Error('No appointment by this Customer at requested time'));
                } else {
                    // Delete event for the requested time period
                    calendar.events.delete({
                        auth: serviceAccountAuth,
                        calendarId: CalendarId,
                        eventId: calendarResponse.data.items[0].id
                    }, (err, event) => {
                        err ? reject(err) : resolve(event);
                    }
                    );
                }
            });
        });
    }

    function GiveFeedBackHandler(agent) {
        const DateService = agent.parameters.DateService.split('T')[0].split('-').reverse().join('-');
        const DateCurrent = new Date().toISOString().split('T')[0].split('-').reverse().join('-');
        const Stylist = agent.parameters.Stylist;
        const Rating = agent.parameters.Rating;
        const Comment = agent.parameters.Comment;
        const CustName = agent.parameters.CustName;

        db.collection("FeedbackDB").add({ DateCurrent: DateCurrent, DateService: DateService, Stylist: Stylist, Rating: Rating, Comment: Comment, CustName: CustName });
        agent.add(`${CustName}，非常感谢您的回馈。您的回馈已经呈上去了。您可以重新再来或者结束电话。谢谢您使用洁琪美容院，特别天皇巨星版。祝您有愉快的一天！`);
    }

    function ShampooHandler(agent) {
        const DateCurrent = new Date().toISOString().split('T')[0].split('-').reverse().join('-');
        const CollectDate = agent.parameters.CollectDate.split('T')[0].split('-').reverse().join('-');
        const ShampooQty = agent.parameters.ShampooQty;
        const CustName = agent.parameters.CustName;
        const CustMobile = agent.parameters.CustMobile;
        const CustEmail = agent.parameters.CustEmail;

        // Email Notification to Salon Fulfillment Team
        const EmailSubject1 = 'New Shampoo Order from ' + CustName;
        const EmailBody1 = 'Dear Shampoo Order Fulfillment Team' +
            '<p> This is an automatically generated email for Shampoo Order.' +
            '<p> Please be informed that there is a new order as follows.' +
            '<p><strong> Customer Name: </strong>' + CustName +
            '<br><strong> Customer Mobile: </strong>' + CustMobile +
            '<br><strong> Shampoo Quantity: </strong>' + ShampooQty +
            '<br><strong> Date of Collection: </strong>' + CollectDate +
            '<p> Please get ready the shampoo for collection. <p> Thank you.' +
            '<p> From: Jackie Hair Salon Chinese Chatbot';

        // Email Notification to Customer    
        const EmailSubject2 = '预订洁琪特制洗发液通知';
        const EmailBody2 = '尊敬的客户' + CustName +
            '<p> 非常感谢您预定了洁琪特制洗发液。' +
            '<p> 您的预订详情如下：' +
            '<p><strong> 客户名字: </strong>' + CustName +
            '<br><strong> 预订瓶数: </strong>' + ShampooQty +
            '<br><strong> 取货日期: </strong>' + CollectDate +
            '<p> 非常感谢您对我们洁琪美容院的支持和关怀。我们期待着早日在美容院与您相见。' +
            '<p> 祝您有美好的一天！' +
            '<p> 发至于：洁琪美容院人工智能机器人';

        // Send email to customer and order fulfillment team
        sendEmail(FulfillmentEmail, EmailSubject1, EmailBody1);
        sendEmail(CustEmail, EmailSubject2, EmailBody2);

        // Write order document to Firestore DB
        db.collection("ShampooOrderDB").add({ DateCurrent: DateCurrent, CollectDate: CollectDate, ShampooQty: ShampooQty, CustName: CustName, CustMobile: CustMobile });
        agent.add(`${CustName}，谢谢您的预购。我们会准备好您要的${ShampooQty}瓶洗发液等待您${CollectDate}来店取货。您可以重新再来或者结束电话。谢谢您使用洁琪美容院，特别天皇巨星版。祝您有美好的一天！`);
    }

    function sendEmail(RecipientEmail, EmailSubject, EmailBody) {
        const mailOptions = {
            from: ChatbotEmail,
            to: RecipientEmail
        };
        mailOptions.subject = EmailSubject;
        mailOptions.html = EmailBody;
        return mailTransport.sendMail(mailOptions).then(() => {
            return console.log('Email sent to:', RecipientEmail);
        });
    }

    let intentMap = new Map();
    intentMap.set('MakeAppt', makeAppointment);
    intentMap.set('GiveFeedBack', GiveFeedBackHandler);
    intentMap.set('ChangeStylist', makeAppointment);
    intentMap.set('ChangeDateTime', makeAppointment);
    intentMap.set('ChangeTime', makeAppointment);
    intentMap.set('OrderShampoo', ShampooHandler);
    intentMap.set('AddShampoo', ShampooHandler);
    intentMap.set('DeleteAppt', DeleteApptHandler);
    agent.handleRequest(intentMap);
});
