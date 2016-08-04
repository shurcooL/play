package main

import (
	"os"

	"golang.org/x/oauth2"
	githuboauth2 "golang.org/x/oauth2/github"
)

var githubConfig = oauth2.Config{
	ClientID:     os.Getenv("GH_BASIC_CLIENT_ID"),
	ClientSecret: os.Getenv("GH_BASIC_SECRET_ID"),
	Scopes:       nil,
	Endpoint:     githuboauth2.Endpoint,
}
