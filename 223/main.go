// Play with accessing a notifiations API via authenticated client.
package main

import (
	"context"
	"log"
	"os"

	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/notifications"
	"github.com/shurcooL/notificationsapp/httpclient"
	"golang.org/x/oauth2"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	src := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: os.Getenv("DMITRI_TOKEN")},
	)
	httpClient := oauth2.NewClient(context.Background(), src)

	notificationsClient := httpclient.NewNotifications(httpClient, "https", "dmitri.shuralyov.com")

	goon.Dump(
		notificationsClient.Count(context.Background(), notifications.ListOptions{}),
	)

	return nil
}
