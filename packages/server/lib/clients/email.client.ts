import formData from 'form-data';
import Mailgun from 'mailgun.js';

class EmailClient {
    private static instance: EmailClient;
    private client: any;

    private constructor(config: { username: string; key: string }) {
        const mailgun = new Mailgun(formData);
        this.client = mailgun.client(config);
    }

    static getInstance() {
        if (!EmailClient.instance) {
            EmailClient.instance = new EmailClient({
                username: 'api',
                key: process.env['MAILGUN_API_KEY'] || 'EMPTY'
            });
        }
        return EmailClient.instance;
    }

    send(email: string, subject: string, html: string) {
        if (process.env['MAILGUN_API_KEY'] === undefined || process.env['MAILGUN_API_KEY'] === 'EMPTY' || !this.client) {
            console.log('Email client not configured');
            console.log('The following email would have been sent:');
            console.log(email, subject, html);
            return;
        }
        return this.client.messages.create('email.nango.dev', {
            from: 'Nango <support@nango.dev>',
            to: [email],
            subject,
            html
        });
    }
}

export default EmailClient;
