import type { Metadata } from 'next';
import PublicInformation from '../_components/public-information';

export const metadata: Metadata = {
  title: 'About Xtreme Avatar',
  description: 'Learn about Xtreme Avatar, account sign-in and optional Google Workspace connections.',
};

export default function AboutPage() {
  return (
    <PublicInformation
      title="About Xtreme Avatar"
      introduction="Xtreme Avatar is an AI workspace for conversations, voice and connected business tools. It brings an assistant interface, personal settings and optional account connections into one place."
    >
      <section aria-labelledby="purpose">
        <h2 id="purpose">What the app is for</h2>
        <p>
          Use the available assistant features to ask questions, prepare work,
          manage preferences and review information from services you choose to
          connect. The app includes interfaces for chat, voice, avatar video,
          calendar appointments and reviewed business actions.
        </p>
        <p>
          Account features may require an invitation and a configured service.
          Some experiences are still previews. A preview, a connected account or
          a granted permission does not confirm that a live action has completed;
          check the result shown for the specific action.
        </p>
      </section>
      <section aria-labelledby="signin">
        <h2 id="signin">Google sign-in identifies your account</h2>
        <p>
          Google sign-in is used to establish your Xtreme Avatar account
          identity through the app’s authentication service. Account identity
          and membership determine access to your saved settings and app data.
        </p>
        <p>
          Permission to use Google Workspace data is requested through a
          separate connection flow. Signing in and connecting Workspace serve
          different purposes.
        </p>
      </section>
      <section aria-labelledby="workspace">
        <h2 id="workspace">Google Workspace access is optional</h2>
        <p>
          Where Workspace connection controls are available, choose the Google
          services you want to connect and review Google’s consent screen.
          Availability depends on the deployed app version and your account.
          The connection flow requests read and write permissions for selected
          services: Gmail, Calendar, Drive, Docs,
          Sheets, Slides, Contacts and Tasks. These permissions can include
          deleting content; Gmail access includes sending and permanently
          deleting mail. They are broader than sign-in information.
        </p>
        <p>
          A permission grant and an available app action are separate. Only
          actions supported by the configured service can run. For example, the
          Calendar interface provides a review before a supported change is
          saved. Granting access does not make every Google operation available
          in the assistant.
        </p>
        <p>
          You can leave Workspace disconnected. If your app version exposes
          Connected Apps, that screen contains its connection controls. You can
          also review or remove Google permissions in{' '}
          <a href="https://myaccount.google.com/connections">your Google Account</a>.
          Removing a connection is different from deleting app records or
          content already held by a provider.
        </p>
      </section>
      <section aria-labelledby="privacy">
        <h2 id="privacy">Privacy information under review</h2>
        <p>
          The <a href="/privacy">privacy notice draft</a> describes the data flows
          identified in the app and the disclosures that still need verification.
          It is a review copy, with no effective date. A final notice will need
          confirmed operator, retention, deletion and provider information.
        </p>
      </section>
      <p><a href="/">Open Xtreme Avatar</a></p>
    </PublicInformation>
  );
}
