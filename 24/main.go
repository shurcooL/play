// Sample values of Go types.
package main

import (
	"net/http"
	"reflect"

	"github.com/shurcooL/go-goon"
)

type sampleValueDb struct {
	db map[string]map[string]interface{} // E.g., "net/http" -> "Request" -> []http.Request.
}

func NewSampleValueDb() *sampleValueDb {
	return &sampleValueDb{
		db: make(map[string]map[string]interface{}),
	}
}

func (this *sampleValueDb) AddSample(sample interface{}) {
	sampleType := reflect.TypeOf(sample)

	if _, ok := this.db[sampleType.PkgPath()]; !ok {
		this.db[sampleType.PkgPath()] = make(map[string]interface{})
	}
	pkgPathDb := this.db[sampleType.PkgPath()]

	var samplesValue reflect.Value

	if _, ok := pkgPathDb[sampleType.Name()]; !ok {
		samplesValue = reflect.MakeSlice(reflect.SliceOf(sampleType), 0, 0)
		pkgPathDb[sampleType.Name()] = samplesValue.Interface()
	} else {
		samplesValue = reflect.ValueOf(pkgPathDb[sampleType.Name()])
	}

	pkgPathDb[sampleType.Name()] = reflect.Append(samplesValue, reflect.ValueOf(sample)).Interface()
}

func main() {
	db := NewSampleValueDb()

	db.AddSample(http.Request{Method: "sample"})
	db.AddSample(http.Request{Method: "sample2"})

	goon.Dump(db.db["net/http"]["Request"])
}
