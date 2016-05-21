// Play with Twitter API.
package main

import (
	"flag"
	"log"
	"net/http"

	"github.com/dghubble/go-twitter/twitter"
	"github.com/gregjones/httpcache"
	"github.com/shurcooL/go-goon"
	"golang.org/x/oauth2"
)

var httpFlag = flag.String("http", ":8080", "Listen for HTTP connections on this address.")

func main() {
	flag.Parse()

	authTransport := &oauth2.Transport{
		Source: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: ""}),
	}
	cacheTransport := httpcache.NewMemoryCacheTransport()
	cacheTransport.Transport = authTransport
	twitter := twitter.NewClient(&http.Client{Transport: cacheTransport})

	err := run(twitter)
	if err != nil {
		log.Fatalln(err)
	}
}

func run(cl *twitter.Client) error {
	/*tws, _, err := cl.Timelines.UserTimeline(&twitter.UserTimelineParams{UserID: 21361484})
	if err != nil {
		return err
	}
	goon.DumpExpr(len(tws))
	if len(tws) > 5 {
		tws = tws[:5]
	}
	goon.DumpExpr(tws)*/

	/*user, _, err := cl.Users.Show(&twitter.UserShowParams{UserID: 21361484})
	if err != nil {
		return err
	}
	goon.DumpExpr(user)*/

	fs, _, err := cl.Followers.List(&twitter.FollowerListParams{UserID: 21361484})
	if err != nil {
		return err
	}
	goon.DumpExpr(len(fs.Users))
	if len(fs.Users) > 5 {
		fs.Users = fs.Users[:5]
	}
	goon.DumpExpr(fs.Users)

	return nil
}

/*func accessToken() {
	const (
		consumerKey    = ""
		consumerSecret = ""
	)

	encodedKeySecret := base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%s",
		url.QueryEscape(consumerKey),
		url.QueryEscape(consumerSecret))))

	req, err := http.NewRequest("POST", "https://api.twitter.com/oauth2/token", strings.NewReader("grant_type=client_credentials"))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Basic %s", encodedKeySecret))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	type BearerToken struct {
		AccessToken string `json:"access_token"`
	}
	var bt BearerToken
	err = json.Unmarshal(body, &bt)
	if err != nil {
		return err
	}

	goon.DumpExpr(bt)
}*/
