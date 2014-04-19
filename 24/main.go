// Sample values of Go types.
package main

import (
	"net/http"
	"reflect"

	"github.com/shurcooL/go-goon"
)

type sampleValueDb struct {
	db map[reflect.Type]interface{}
}

func NewSampleValueDb() *sampleValueDb {
	return &sampleValueDb{
		db: make(map[reflect.Type]interface{}),
	}
}

func (this *sampleValueDb) AddSample(sample interface{}) {
	sampleType := reflect.TypeOf(sample)

	var samplesValue reflect.Value

	if this.db[sampleType] == nil {
		samplesValue = reflect.MakeSlice(reflect.SliceOf(sampleType), 0, 0)
		this.db[sampleType] = samplesValue.Interface()
	} else {
		samplesValue = reflect.ValueOf(this.db[sampleType])
	}

	this.db[sampleType] = reflect.Append(samplesValue, reflect.ValueOf(sample)).Interface()
}

func main() {
	db := NewSampleValueDb()

	db.AddSample(http.Request{Method: "sample"})
	db.AddSample(http.Request{Method: "sample2"})

	for _, v := range db.db[reflect.TypeOf(http.Request{})].([]http.Request) {
		goon.Dump(v)
	}
}
