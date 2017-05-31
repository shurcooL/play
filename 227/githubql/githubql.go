package githubql

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"sort"
	"unicode"

	"github.com/shurcooL/Conception-go/pkg/gist6003701"
	"github.com/shurcooL/go/ctxhttp"
)

type Client struct {
	httpClient *http.Client
}

func NewClient(httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Client{
		httpClient: httpClient,
	}
}

func (c *Client) Query(ctx context.Context, q interface{}, variables map[string]interface{}) error {
	return c.do(ctx, "query", q, variables)
}

// THINK: Consider having Mutate accept input separate from variables (since they're often left nil). For convenience.
func (c *Client) Mutate(ctx context.Context, m interface{}, variables map[string]interface{}) error {
	return c.do(ctx, "mutation", m, variables)
}

// op is Operation Type, one of "query", "mutation", or "subscription" (not yet supported).
func (c *Client) do(ctx context.Context, op string, v interface{}, variables map[string]interface{}) error {
	var query string
	switch op {
	case "query":
		query = constructQuery(v, variables)
	case "mutation":
		query = constructMutation(v, variables)
	}
	fmt.Println(query)
	var in = struct {
		Query     string                 `json:"query"`
		Variables map[string]interface{} `json:"variables,omitempty"`
	}{
		Query:     query,
		Variables: variables,
	}
	var buf bytes.Buffer
	err := json.NewEncoder(&buf).Encode(in)
	if err != nil {
		return err
	}
	resp, err := ctxhttp.Post(ctx, c.httpClient, "https://api.github.com/graphql", "application/json", &buf)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status: %v", resp.Status)
	}
	var out = struct {
		Data       interface{}
		Errors     errors
		Extensions interface{} // Currently unused.
	}{Data: v}
	err = json.NewDecoder(resp.Body).Decode(&out)
	if err != nil {
		return err
	}
	if len(out.Errors) > 0 {
		return out.Errors
	}
	return nil
}

type errors []struct {
	Message   string
	Locations []struct {
		Line   int
		Column int
	}
}

func (e errors) Error() string {
	return e[0].Message
}

func constructQuery(v interface{}, variables map[string]interface{}) string {
	query := querify(v)
	if variables != nil {
		return "query(" + queryArguments(variables) + ")" + query
	}
	return query
}

func constructMutation(v interface{}, variables map[string]interface{}) string {
	query := querify(v)
	if variables != nil {
		return "mutation(" + queryArguments(variables) + ")" + query
	}
	return "mutation" + query
}

func queryArguments(variables map[string]interface{}) string {
	sorted := make([]string, 0, len(variables))
	for k := range variables {
		sorted = append(sorted, k)
	}
	sort.Strings(sorted)
	var s string
	for _, k := range sorted {
		v := variables[k]
		s += "$" + k + ":"
		t := reflect.TypeOf(v)
		if t.Kind() == reflect.Ptr {
			// Pointer is an optional type, so no "!" at the end.
			s += t.Elem().Name() // E.g., "Int".
		} else {
			// Value is a required type, so add "!" to the end.
			s += t.Name() + "!" // E.g., "Int!".
		}
	}
	return s
}

func querify(v interface{}) string {
	var buf bytes.Buffer
	querifyValue(&buf, reflect.Indirect(reflect.ValueOf(v)))
	return buf.String()
}

func querifyValue(w io.Writer, v reflect.Value) {
	//if v.Kind() == reflect.Ptr && v.IsNil() {
	//	w.Write([]byte("<nil>"))
	//	return
	//}
	//v = reflect.Indirect(v)

	switch v.Kind() {
	case reflect.Struct:
		// special handling of DateTime values
		if v.Type() == dateTimeType {
			return
		}

		//if v.Type().Name() != "" {
		//	w.Write([]byte(mixedCapsToLowerCamelCase(v.Type().String())))
		//}

		w.Write([]byte{'{'})

		var sep bool
		for i := 0; i < v.NumField(); i++ {
			fv := v.Field(i)
			//if fv.Kind() == reflect.Ptr && fv.IsNil() {
			//	continue
			//}
			//if fv.Kind() == reflect.Slice && fv.IsNil() {
			//	continue
			//}

			if sep {
				w.Write([]byte(","))
			} else {
				sep = true
			}

			if value, ok := v.Type().Field(i).Tag.Lookup("graphql"); ok {
				w.Write([]byte(value))
			} else {
				w.Write([]byte(mixedCapsToLowerCamelCase(v.Type().Field(i).Name)))
			}
			querifyValue(w, fv)
		}

		w.Write([]byte{'}'})
	case reflect.Ptr, reflect.Slice:
		querifyType(w, v.Type().Elem())
	default:
		//if v.Type().Name() != "" {
		//	w.Write([]byte(v.Type().String()))
		//}
	}
}

func querifyType(w io.Writer, t reflect.Type) {
	switch t.Kind() {
	case reflect.Ptr, reflect.Slice:
		querifyType(w, t.Elem())
	case reflect.Struct:
		// special handling of DateTime values
		if t == dateTimeType {
			return
		}

		w.Write([]byte{'{'})

		var sep bool
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)

			if sep {
				w.Write([]byte(","))
			} else {
				sep = true
			}

			if value, ok := f.Tag.Lookup("graphql"); ok {
				w.Write([]byte(value))
			} else {
				w.Write([]byte(mixedCapsToLowerCamelCase(f.Name)))
			}
			querifyType(w, f.Type)
		}

		w.Write([]byte{'}'})
	}
}

var dateTimeType = reflect.TypeOf(DateTime{})

func mixedCapsToLowerCamelCase(s string) string {
	r := []rune(gist6003701.UnderscoreSepToCamelCase(gist6003701.MixedCapsToUnderscoreSep(s)))
	if len(r) == 0 {
		return ""
	}
	r[0] = unicode.ToLower(r[0])
	return string(r)
}
