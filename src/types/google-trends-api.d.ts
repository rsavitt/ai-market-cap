declare module 'google-trends-api' {
  interface InterestOverTimeOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
  }

  export function interestOverTime(options: InterestOverTimeOptions): Promise<string>;
}
