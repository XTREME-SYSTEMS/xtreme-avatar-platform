import type { Metadata } from 'next';
import PublicInformation from '../_components/public-information';

export const metadata: Metadata = {
  title: 'Privacy Notice Draft — Xtreme Avatar',
  description: 'Review draft of Xtreme Avatar privacy information. Not an adopted or effective privacy notice.',
  robots: { index: false, follow: false, nocache: true },
};

export default function PrivacyDraftPage() {
  return (
    <PublicInformation
      draft
      title="Privacy notice draft"
      introduction="This review copy summarizes data flows identified in the app’s source. It is not a completed audit of live services, provider contracts or retention practices, and it does not ask for consent."
    >
      <section aria-labelledby="operator">
        <h2 id="operator">1. Operator and scope — confirmation required</h2>
        <p>
          Product: Xtreme Avatar / XPS Intelligence. The legal operator, its
          address, a working privacy contact and the effective date have not
          been confirmed for this notice. The final notice must identify the
          entity responsible for this app and the people and regions it serves.
        </p>
      </section>
      <section aria-labelledby="data">
        <h2 id="data">2. Information associated with app features</h2>
        <p>
          The following categories appear in the reviewed implementation.
          Optional feature data depends on the services configured and the
          features a person chooses to use.
        </p>
        <ul>
          <li><strong>Account and membership:</strong> account identifier, verified email, membership role and status, and invitation or membership audit records.</li>
          <li><strong>Saved app information:</strong> profile name, assistant preferences, drafts, contacts, plans and transcripts submitted to supported account features.</li>
          <li><strong>Assistant conversations:</strong> prompts, conversation context, replies, request identifiers, timestamps and action results. The chat implementation stores conversation records; it is not described as storage-free.</li>
          <li><strong>Optional integrations:</strong> connected account information and granted permissions, Calendar information returned by enabled tools, and job files uploaded through the available file features.</li>
          <li><strong>Voice, video and personalization:</strong> microphone or other media supplied to an enabled session, plus approved profile or memory context from a separately linked Call Desk account. Recording, transcription and provider retention require separate verification.</li>
          <li><strong>Session and operational information:</strong> sign-in cookies and records used to track requests, outcomes and account changes. Production logging, analytics and their retention have not been fully verified.</li>
        </ul>
      </section>
      <section aria-labelledby="purpose">
        <h2 id="purpose">3. Purposes reflected in the implementation</h2>
        <p>
          The app uses account information to authenticate members and control
          access; saved settings to personalize supported assistant features;
          submitted content to process requests; and connection information to
          use selected services. Request and action records support result
          history and recovery when an action’s outcome is uncertain.
        </p>
        <p>
          The operator must confirm the final purposes, applicable legal bases
          and any additional production uses before adopting this notice.
        </p>
      </section>
      <section aria-labelledby="google">
        <h2 id="google">4. Google sign-in and optional Workspace access</h2>
        <p>
          Google sign-in identifies the app account through Supabase
          authentication. Workspace access has its own approval flow and is
          optional. The current connection contract requests read and write
          access for the selected Google services, including deletion
          permissions. Gmail permission includes sending and permanently
          deleting mail. This is not a read-only grant.
        </p>
        <p>
          Granted permissions do not mean every operation is available in the
          app. Review the requested permissions on Google’s consent screen and
          the specific action offered by the app. You can manage Google grants
          in <a href="https://myaccount.google.com/connections">your Google Account</a>.
          The final notice must describe the data actually accessed, permitted
          uses, token handling and verified revocation behavior.
        </p>
      </section>
      <section aria-labelledby="providers">
        <h2 id="providers">5. Service providers — verification required</h2>
        <p>
          The reviewed source connects to Google, Supabase authentication and
          server services, and a Railway runtime. It includes interfaces for
          GPT-based assistant services, Tavus video, Twilio calling and a
          separate Call Desk profile service. These references do not establish
          which services are active for every account.
        </p>
        <p>
          Before publication, the operator must confirm the actual hosting,
          database, AI, media, communications and support providers; what each
          receives; its contractual role; processing locations; and retention
          or transfer arrangements. Vendor settings and agreements must support
          any statement about model training, advertising, selling or sharing
          personal information. This draft makes no adopted promise about those
          practices.
        </p>
      </section>
      <section aria-labelledby="retention">
        <h2 id="retention">6. Retention and deletion — unresolved</h2>
        <p>
          No verified retention schedule is supplied in this draft. Account
          data, chat and context records, files, connection credentials, action
          receipts, logs, backups and any recordings require separate confirmed
          rules. A limited history display or a session timeout is not a data
          deletion schedule.
        </p>
        <p>
          Disconnecting an integration does not establish that previously saved
          app or provider records have been deleted. A working privacy request
          channel, account deletion procedure, provider deletion steps and
          backup handling must be verified before the final notice describes
          deletion rights or completion times.
        </p>
      </section>
      <section aria-labelledby="completion">
        <h2 id="completion">7. Information needed for a final notice</h2>
        <ul>
          <li>Confirmed legal operator, contact details, intended audience and supported regions.</li>
          <li>Approved retention periods and verified access, correction, export and deletion procedures.</li>
          <li>Accurate provider and data-use disclosures, including media, model training and any analytics or advertising.</li>
          <li>Review of the final text against live behavior, followed by an effective date and version record.</li>
        </ul>
        <p>
          This draft does not replace those decisions or enable an optional
          service. See <a href="/about">About Xtreme Avatar</a> for the app’s
          purpose and the distinction between sign-in and Workspace access.
        </p>
      </section>
    </PublicInformation>
  );
}
