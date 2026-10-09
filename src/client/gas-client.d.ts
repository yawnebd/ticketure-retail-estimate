/** Minimal typing for the google.script.run bridge available inside HtmlService pages. */
declare namespace google.script {
  interface Runner {
    withSuccessHandler(handler: (value: any) => void): Runner;
    withFailureHandler(handler: (error: Error) => void): Runner;
    [serverFunction: string]: any;
  }
  const run: Runner;
}
