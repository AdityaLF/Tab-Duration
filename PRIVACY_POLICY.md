# Privacy Policy

Tab Duration stores browsing-time records and extension settings in the browser's local extension storage. It does not upload browsing history or time-tracking records to a Tab Duration server, and it does not use analytics.

## Information stored locally

The extension stores daily time totals by website domain, tracking settings such as Track All Web and Pause When Inactive, the selected dark or light theme, whitelist and ignore-list entries, and notification dismissal timestamps. Temporary tracking state is stored in the browser's session storage.

The extension reads the active tab's URL and browser focus state to decide which domain to track and whether to show a site suggestion.

## Favicon requests

To display website icons, the extension requests favicons from Google's favicon service at `https://www.google.com/s2/favicons`. The website domain is included in the request. Google therefore receives the requested domain and may receive standard connection information, such as the request's IP address. These requests are subject to Google's privacy practices.

The extension sends favicon requests only to retrieve site icons. A requested domain is disclosed in that request, but time totals, the full browsing history, and extension settings are not sent.

## Retention and deletion

Time-tracking records older than 31 days are automatically removed. CSV export includes the records that are still stored when the export is created. Use Reset Data to remove the stored time-tracking records sooner.

Extension settings and list entries remain stored until changed or removed by the user, or until the extension's browser data is removed.
