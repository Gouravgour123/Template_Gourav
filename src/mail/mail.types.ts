// Define the payload structure for sending verification code emails
type VerificationCodeMailPayload = {
  username: string; 
  code: string; 
  expirationTime: string;
};

// Define the type for the register verification code mail template
export type RegisterVerificationCodeMailTemplate = {
  name: 'register-verification-code'; 
  data: VerificationCodeMailPayload; 
};

// Define the type for the reset password verification code mail template
export type ResetPasswordVerificationCodeMailTemplate = {
  name: 'reset-password-verification-code'; 
  data: VerificationCodeMailPayload; // Data payload for the template
};

// Define a union type for different mail templates
export type MailTemplate =
  | RegisterVerificationCodeMailTemplate
  | ResetPasswordVerificationCodeMailTemplate; 

// Define the parameters for sending emails
export type MailParams = {
  subject: string;
  template: MailTemplate;
};
