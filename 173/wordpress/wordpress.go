// Package wordpress implements issues.Service using a WordPress XML export.
package wordpress

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"html/template"
	"io/ioutil"
	"regexp"
	"strings"
	"time"

	"github.com/shurcooL/go/gists/gist5439318"
	"github.com/shurcooL/issues"
	"github.com/shurcooL/users"
)

type service struct {
	users users.Service

	is  []issues.Issue
	ics [][]issues.Comment
}

// NewService creates a new service with path to XML file.
func NewService(path string, users users.Service) (issues.Service, error) {
	b, err := ioutil.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var v struct {
		Channel struct {
			Title string `xml:"title"`
			Item  []struct {
				Title          string `xml:"title"`
				Link           string `xml:"link"`
				WpStatus       string `xml:"status"`
				PostDate       string `xml:"post_date_gmt"`
				PostDateBackup string `xml:"post_date"`
				Content        []struct {
					XMLName xml.Name
					CDATA   string `xml:",chardata"`
				} `xml:"encoded"`
				Comments []struct {
					ID          int    `xml:"comment_id"`
					AuthorName  string `xml:"comment_author"`
					AuthorEmail string `xml:"comment_author_email"`
					Date        string `xml:"comment_date_gmt"`
					Content     string `xml:"comment_content"`
				} `xml:"comment"`
			} `xml:"item"`
		} `xml:"channel"`
	}

	err = xml.Unmarshal(b, &v)
	if err != nil {
		return nil, err
	}

	s := &service{
		users: users,
	}

	shurcooL := s.issuesUser(context.TODO(), issues.UserSpec{ID: 1924134, Domain: "github.com"})

	//for i := len(v.Channel.Item) - 1; i >= 0; i-- {
	for _, x := range v.Channel.Item {
		//x := v.Channel.Item[i]

		if (x.WpStatus != "publish" && x.WpStatus != "draft") || x.Link == "http://shurcool.wordpress.com/about/" {
			continue
		}

		i := issues.Issue{
			ID:    uint64(len(s.is) + 1),
			Title: simplifyToASCII(x.Title),
		}
		switch x.WpStatus {
		case "publish":
			i.State = issues.OpenState
		case "draft":
			i.State = issues.ClosedState
		}

		postDate, err := time.Parse("2006-01-02 15:04:05", x.PostDate)
		if err != nil {
			postDate, err = time.Parse("2006-01-02 15:04:05", x.PostDateBackup)
			if err != nil {
				return nil, err
			}
		}
		i.CreatedAt = postDate.UTC()

		i.User = shurcooL

		for _, y := range x.Content {
			if !strings.HasSuffix(y.XMLName.Space, "/content/") {
				continue
			}
			y.CDATA = simplifyToASCII(y.CDATA)
			y.CDATA = rewriteWordPress(y.CDATA)
			i.Body = y.CDATA
		}

		var cs []issues.Comment
		for _, c := range x.Comments {
			commentDate, err := time.Parse("2006-01-02 15:04:05", c.Date)
			if err != nil {
				return nil, err
			}
			comment := issues.Comment{
				ID:        uint64(c.ID),
				CreatedAt: commentDate.UTC(),
				Body:      c.Content,
			}
			switch c.AuthorName {
			//case "shurcool@gmail.com":
			case "shurcooL`":
				comment.User = shurcooL
			case "Mee":
				comment.User = s.issuesUser(context.TODO(), issues.UserSpec{ID: 4332971, Domain: "github.com"})
			case "Bernardo":
				comment.User = s.issuesUser(context.TODO(), issues.UserSpec{ID: 2, Domain: "dmitri.shuralyov.com"})
			case "Michal Marcinkowski":
				comment.User = s.issuesUser(context.TODO(), issues.UserSpec{ID: 3, Domain: "dmitri.shuralyov.com"})
			case "Anders Elfgren":
				comment.User = s.issuesUser(context.TODO(), issues.UserSpec{ID: 4, Domain: "dmitri.shuralyov.com"})
			case "benp":
				comment.User = s.issuesUser(context.TODO(), issues.UserSpec{ID: 5, Domain: "dmitri.shuralyov.com"})
			default:
				comment.User = issues.User{
					Login:     c.AuthorName,
					AvatarURL: template.URL("https://secure.gravatar.com/avatar?d=mm&f=y&s=96"),
					HTMLURL:   template.URL("mailto:" + c.AuthorEmail),
				}
				panic(c.AuthorName)
			}
			cs = append(cs, comment)

			// Manual migration of a single comment from a temporary gist mirror of this blog post.
			if i.ID == 11 {
				// TODO: Get via a githubapi users.Service so that avatar and html urls are up to date? But with caching/mirroring?
				//       Maybe not needed since both only refer to ID and login which are immutable at this time...
				// https://api.github.com/users/pbakaus
				pbakaus := s.issuesUser(context.TODO(), issues.UserSpec{ID: 43004, Domain: "github.com"})
				commentDate, err := time.Parse(time.RFC3339, "2014-03-27T09:01:58Z")
				if err != nil {
					return nil, err
				}
				commentByPbakaus := issues.Comment{
					ID:        2,
					CreatedAt: commentDate.UTC(),
					Body:      "So the biggest reason, I suspect, as to why your 120 Hz CRT looks so much better is eye induced motion blur. Here are two great articles that talk about the difference in CRTs and LCDs regarding motion blur: http://scien.stanford.edu/pages/labsite/2010/psych221/projects/2010/LievenVerslegers/LCD_Motion_Blur_Lieven_Verslegers.htm and http://msdn.microsoft.com/en-us/library/windows/hardware/gg463407.aspx. Especially the second is very worthwhile and much of it is the base for my conference talk on FPS!",
					User:      pbakaus,
				}
				cs = append(cs, commentByPbakaus)
			}
		}

		i.Replies = len(cs)

		s.is = append(s.is, i)
		s.ics = append(s.ics, cs)
	}

	return s, nil
}

func (s service) List(_ context.Context, repo issues.RepoSpec, opt issues.IssueListOptions) ([]issues.Issue, error) {
	var is []issues.Issue
	for i := len(s.is) - 1; i >= 0; i-- {
		issue := s.is[i]
		if opt.State != issues.AllStates && issue.State != issues.State(opt.State) {
			continue
		}
		is = append(is, issue)
	}
	return is, nil
}

func (s service) Count(_ context.Context, repo issues.RepoSpec, opt issues.IssueListOptions) (uint64, error) {
	var count uint64
	for _, issue := range s.is {
		if opt.State != issues.AllStates && issue.State != issues.State(opt.State) {
			continue
		}
		count++
	}
	return count, nil
}

func (s service) Get(_ context.Context, repo issues.RepoSpec, id uint64) (issues.Issue, error) {
	return s.is[id-1], nil
}

func (s service) ListComments(_ context.Context, repo issues.RepoSpec, id uint64, opt interface{}) ([]issues.Comment, error) {
	var cs []issues.Comment
	cs = append(cs, s.is[id-1].Comment)
	cs = append(cs, s.ics[id-1]...)
	return cs, nil
}

func (s service) ListEvents(_ context.Context, repo issues.RepoSpec, id uint64, opt interface{}) ([]issues.Event, error) {
	return nil, nil
}

func (s service) Create(_ context.Context, repo issues.RepoSpec, issue issues.Issue) (issues.Issue, error) {
	return issues.Issue{}, errors.New("Create endpoint not implemented in wordpress service implementation")
}

func (s service) CreateComment(_ context.Context, repo issues.RepoSpec, id uint64, comment issues.Comment) (issues.Comment, error) {
	return issues.Comment{}, errors.New("CreateComment endpoint not implemented in wordpress service implementation")
}

func (s service) Edit(_ context.Context, repo issues.RepoSpec, id uint64, ir issues.IssueRequest) (issues.Issue, []issues.Event, error) {
	return issues.Issue{}, nil, errors.New("Edit endpoint not implemented in wordpress service implementation")
}

func (s service) EditComment(_ context.Context, repo issues.RepoSpec, id uint64, cr issues.CommentRequest) (issues.Comment, error) {
	return issues.Comment{}, errors.New("EditComment endpoint not implemented in wordpress service implementation")
}

func (s service) Search(_ context.Context, opt issues.SearchOptions) (issues.SearchResponse, error) {
	return issues.SearchResponse{}, errors.New("Search endpoint not implemented in wordpress service implementation")
}

func (service) CurrentUser(_ context.Context) (*issues.User, error) {
	user := issues.UserSpec{ID: uint64(0)}
	u := issues.User{
		UserSpec:  user,
		Login:     fmt.Sprintf("Anonymous %v", user.ID),
		AvatarURL: "https://secure.gravatar.com/avatar?d=mm&f=y&s=96",
		HTMLURL:   "",
	}
	return &u, nil
}

func simplifyToASCII(s string) string {
	s = strings.Replace(s, "\u2019", "'", -1)
	s = strings.Replace(s, "\u00a0", " ", -1)
	return s
}

func rewriteWordPress(s string) string {
	re := regexp.MustCompile(`http:\/\/shurcool\.files\.wordpress\.com\/[0-9]{4}\/[0-9]{2}\/`)
	s = re.ReplaceAllString(s, "")

	re = regexp.MustCompile(`\?w=[0-9]+`)
	s = re.ReplaceAllString(s, "")

	re = regexp.MustCompile(` width="[0-9]+"`)
	s = re.ReplaceAllString(s, "")

	re = regexp.MustCompile(` height="[0-9]+"`)
	s = re.ReplaceAllString(s, "")

	re = regexp.MustCompile(`\[tweet ([0-9]+)\]`)
	repl := func(s string) string {
		tweetID := re.ReplaceAllString(s, "$1")
		return gist5439318.GetTweetHtml(tweetID)
	}
	s = re.ReplaceAllStringFunc(s, repl)

	return s
}

func (s service) issuesUser(ctx context.Context, user issues.UserSpec) issues.User {
	u, err := s.users.Get(ctx, users.UserSpec{ID: user.ID, Domain: user.Domain})
	if err != nil {
		return issues.User{
			UserSpec:  user,
			Login:     fmt.Sprintf("Anonymous %v", user.ID),
			AvatarURL: "https://secure.gravatar.com/avatar?d=mm&f=y&s=96",
			HTMLURL:   "",
		}
	}
	return issues.User{
		UserSpec:  issues.UserSpec{ID: u.ID, Domain: u.Domain},
		Login:     u.Login,
		AvatarURL: u.AvatarURL,
		HTMLURL:   u.HTMLURL,
	}
}
