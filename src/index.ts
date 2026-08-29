interface MatchDetail {
  readonly id: string;
  readonly startTime: string;
  readonly channel: string;
  readonly homeTeam: MatchDetailTeam;
  readonly awayTeam: MatchDetailTeam;
  readonly outcome: MatchDetailOutcome;
  readonly series: MatchSeries;
  readonly officials: MatchDetailOfficial[];
  readonly showScore: boolean;
  readonly state: string;
  readonly startDateTimeInThePassed: boolean;
  readonly ageGroup: string;
}

interface MatchDetailTeam {
  readonly id: string;
  readonly name: string;
  readonly clubId: string;
  readonly logo: string;
}

interface MatchDetailOutcome {
  readonly status: string;
  readonly homeTeamGoals: number;
  readonly awayTeamGoals: number;
}

interface MatchDetailOfficial {
  readonly lastName: string;
  readonly firstName: string;
  readonly status: string;
  readonly personAssigned: boolean;
}

interface MatchSeries {
  readonly id: string;
  readonly name: string;
}
interface TeamCalendarResponse {
  readonly data: {
    readonly teamCalendar: MatchDetail[];
  };
}
export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const teamId = parseInt(url.pathname.substring(1), 10);

    // Fetch cal info for team
    const teamCalendarResponse = await fetch(
      "https://datalake-prod2018.rbfa.be/graphql",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operationName: "GetTeamCalendar",
          variables: {
            teamId,
            language: "nl",
            sortByDate: "asc",
          },
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                "3f0441e6723b9852b4f0cff2c872f4aa674c5de2d23589efc70c7a4ffb7f6383",
            },
          },
        }),
      },
    );

    const headers = new Headers();
    headers.set("Content-Type", "text/calendar");

    const teamCalendar =
      (await teamCalendarResponse.json()) as TeamCalendarResponse;

    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:RBFACALSYNC"];

    function toDtString(date: Date) {
      return `${date.toISOString().replaceAll("-", "").replaceAll(":", "").split(".")[0]}`;
    }
    for (const match of teamCalendar.data.teamCalendar) {
      const start = new Date(match.startTime);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${match.id}`);
      lines.push("DTSTAMP:20260101T120000");
      lines.push(`DTSTART:${toDtString(start)}`);
      lines.push(`DTEND:${toDtString(end)}`);
      lines.push(`SUMMARY:${match.homeTeam.name} - ${match.awayTeam.name}`);
      lines.push(`DESCRIPTION:${match.series.name}`);
      lines.push(`URL:https://www.rbfa.be/nl/wedstrijd/${match.id}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    return new Response(lines.join("\r\n"), {
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
