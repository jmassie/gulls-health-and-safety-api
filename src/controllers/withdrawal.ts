import transaction from 'sequelize/types/lib/transaction';
import MultiUseFunctions from '../multi-use-functions';
import config from '../config/app';
import database from '../models/index.js';
import ApplicationController from './application';
import AddressController from './address';
import ContactController from './contact';


const {Withdrawal} = database;

// Disabled rules because Notify client has no index.js and implicitly has "any" type, and this is how the import is done
// in the Notify documentation - https://docs.notifications.service.gov.uk/node.html
/* eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, unicorn/prefer-module, prefer-destructuring */
const NotifyClient = require('notifications-node-client').NotifyClient;

/**
 * This function returns an object containing the details required for the license return notification email.
 *
 * @param {any} licenceHolderContact The ID of the licence to which the return pertains.
 * @param {any} licenceApplicantContact The ID of the licence to which the return pertains.
 * @param {any} siteAddress The address of the site to which the return pertains.
 * @param {any} licenceId The ID of the licence to which the return pertains.
 * @param {any} reason A map containing the return details mapped to a species type string as a key.
 * @returns {any} An object with the required details set.
 */
 const setWithdrawEmailDetails = (
  licenceHolderContact: any,
  licenceApplicantContact: any,
  siteAddress: any,
  licenceId: number,
  reason: any,
) => {
  return {
    lhName: licenceHolderContact.name,
    onBehalfName: licenceApplicantContact.name,
    siteAddress: MultiUseFunctions.createSummaryAddress(siteAddress),
    id: licenceId,
    withdrawalReason: reason,
  };
};


/**
 * This function calls the Notify API and asks for an email to be sent with the supplied details.
 *
 * @param {any} emailDetails The details to use in the email to be sent.
 * @param {any} emailAddress The email address to send the email to.
 */
 const sendWithdrawalNotificationEmail = async (emailDetails: any, emailAddress: any) => {
  if (config.notifyApiKey) {
    const notifyClient = new NotifyClient(config.notifyApiKey);
    await notifyClient.sendEmail('ce6c7959-08b7-4694-a162-fac62667c942', emailAddress, {
      personalisation: emailDetails,
      emailReplyToId: '4b49467e-2a35-4713-9d92-809c55bf1cdd',
    });
  }
};

const WithdrawalController = {
  findOne: async (id: number) => {
    return Withdrawal.findByPk(id);
  },

  findAll: async () => {
    return Withdrawal.findAll();
  },

  create: async (cleanedWithdrawal: any) => {
    let newWithdrawal;
    await database.sequelize.transaction(async (t: transaction) => {

    // Add the withdrawal to the database.
    newWithdrawal = await Withdrawal.create(cleanedWithdrawal, {transaction: t});
    });

    let applicationDetails;

    if (newWithdrawal) {
      // Grab the application to some details required for the notify email.
      applicationDetails = await ApplicationController.findOne((newWithdrawal as any).LicenceId);
    }

    let siteAddress;

    // Grab the site address using the SiteAddressId of the application.
    if (applicationDetails?.SiteAddressId) {
      siteAddress = await AddressController.findOne(applicationDetails?.SiteAddressId);
    }

    let licenceHolderName;
    let licenceApplicantName;

    // Grab the licence holder's contact details.
    if (applicationDetails?.LicenceHolderId) {
      licenceHolderName = await ContactController.findOne(applicationDetails?.LicenceHolderId);
    }

    // Grab the licence applicant's contact details.
    if (applicationDetails?.LicenceApplicantId) {
      licenceApplicantName = await ContactController.findOne(applicationDetails?.LicenceApplicantId);
    }
    let withdrawDetails;

    // If we have successfully submitted a withdrawal set the email details.
    if (newWithdrawal && cleanedWithdrawal) {
      // Set the details of the emails.
      const emailDetails = setWithdrawEmailDetails(
        licenceHolderName,
        licenceApplicantName,
        siteAddress,
        (newWithdrawal as any).LicenceId,
        withdrawDetails,
      );
      // If the licence holder and applicant are the same person only send a single email.
      if (licenceHolderName && licenceHolderName?.id === licenceApplicantName?.id) {
        await sendWithdrawalNotificationEmail(emailDetails, licenceHolderName.emailAddress);
      } else {
        // Send an email to both holder and applicant.
        if (licenceHolderName?.emailAddress) {
          await sendWithdrawalNotificationEmail(emailDetails, licenceHolderName.emailAddress);
        }

        if (licenceApplicantName?.emailAddress)
          await sendWithdrawalNotificationEmail(emailDetails, licenceApplicantName.emailAddress);
      }
    }

    return newWithdrawal;
  },
};

export {WithdrawalController as default};
