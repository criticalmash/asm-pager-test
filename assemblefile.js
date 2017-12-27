'use strict';

var assemble = require('assemble');
var extname = require('gulp-extname');
var midden = require('assemble-midden');
var browserSync = require('browser-sync').create();
var watch = require('base-watch');
var app = assemble();
var path = require('path');
var moment = require('moment');
var clone = require('clone');

// custom collections
/**
 *  News items is the collection of pages we want paginated
 *  They come from the `templates/news` directory
 */
app.create('newsitems');
/**
 *  News Lists are the paginated index pages
 *  They don't exist as files in the repo, instead
 *  we'll generate Vinyl objects on the fly then render
 *  them out. Each newslist page will have a list 
 *  of n newsitems and the data needed to build it's own
 *  paginator UI 
 */
app.create('newslists'); // autogenerated pages

/**
 * Midden helper used to output a view's data to help
 * in debugging
 */
// app.helper('midden', midden(true));
app.helpers('helpers', require('handlebars-helpers')() );
app.helpers(require('navigation-helpers'));

app.use(watch());

/**
 * A simple middleware to add a usable permalink to each newsitem,
 * will be used when rendering the paginated results.
 * [note to self: replace with permalink]
 *
 * I'm going to pre-calculate all useful things in this prerender
 * Handlebar's is becoming to untrustworthy
 * https://bryce.fisher-fleig.org/blog/handlebars-considered-harmful/index.html
 */
app.newsitems.onLoad(/\.hbs$/, function newspaths(view, next) {
    if (typeof next !== 'function') {
      throw new TypeError('expected a callback function');
    }
    if(view.data){
      console.log('updating view: ', view.data);
      if(view.key){
        view.data.finalPath = "/news/" + path.parse(view.key).name + ".html";
      }
      view.data.touch = "true";

      // create a pretty date from `published`
      // view.data.printDate = moment(view.data.published).format('MMMM Do, YYYY');
    }
    next(null, view);
});
/**
 * Had issues registering middleware for newsIndex because I couldn't understand
 * how plurification worked. Renamed it newslist(s) and everything is fine
 */
// app.newsitems.preRender(/\.hbs$/, function newslog(view, next) {
//     console.log('preRender news items', view.data);
//     next(null, view);
// });

// app.newslists.preRender(/\.hbs$/, function newspaths(view, next) {
//     console.log('preRender newslists');
//     next(null, view);
// });
// app.pages.preRender(/\.hbs$/, function(view, next) {
//   view.data.allnews = [1,2,3]; //app.list(app.newsitems);
//   next(null, view);
// });

/**
 * Load templates
 */
app.task('layouts', function (cb) {
  app.layouts('templates/layouts/**/*.hbs');
  cb();
});

app.option('layout', 'default');


/**
 * Renders news posts and their index pages
 */
app.task('newspager', function(cb){
  app.newsitems('templates/news/*.hbs');

  // render news items
  app.toStream('newsitems')
    .pipe(app.renderFile())
    .pipe(extname())
    .pipe(app.dest('dist/news'));
  

  // turn page collection into a list collection sorted by publication date descending
  // NOTE: assemble appears to automatically convert YFM values labeled published into a date obj
  var newsList = app.list(app.newsitems).sortBy('data.published', {reverse: true});

  // use List's built-in paginator function to create a paginated list
  // 7 posts at 5 posts per page will give us two items
  var newsPaginated = newsList.paginate({limit: 5});

  // see CLI output to understand paginator format
  // console.log(newsPaginated);

  /**
   * paginate() supplies a lot of useful info for each Page object
   * but it doesn't supply an array of page IDs that can be used in 
   * building a numbered list of pages.
   * We'll generate one here and add it to each Page
   */
  var firstTolast = new Array();
  newsPaginated.forEach(function (page, i) {
    firstTolast.push(i+1);
  });

  // loop through array and create a view for each one
  /**
   * Start adding paginated index pages to the newslist List.
   * Each pageObj will be turned into a Vinyl object when passed
   * to app.newslist()
   */
  newsPaginated.forEach(function(newsPage, i){
    var page = clone(newsPage);
    page.firstTolast = firstTolast;
    page.title = 'News Releases';
    page.layout = 'pagin.hbs';
    var pageNum = i + 1; // paginator indexes by 1
    var pageName = 'news-' + pageNum + '.hbs';
    // var pageContents = '---\ntitle: News releases\nlayout: pagin.hbs\n---\n' + pageName;
    var pageContents = '<h2>Page: ' + pageName + '</h2>'; // moved FM items to data
    var pageObj = {
      content: pageContents,
      data: page,
      path: pageName
    };
    app.newslist(pageName, pageObj);
  });

  // render our indexes
  app.toStream('newslists')
    .pipe(app.renderFile())
    // .on('err', console.error)
    .pipe(extname())
    .pipe(app.dest('dist'));

  cb();
});

/**
 * TO-DO: add task that copies midden js/css files into dist
 */

app.task('content', ['layouts', 'newspager'], function() {
  app.pages('templates/content/*.hbs');
  return app.toStream('pages')
    .pipe(app.renderFile())
    .pipe(extname())
    .pipe(app.dest('dist'))
    .pipe(browserSync.stream());
});

/* copies html and yaml files to build */
app.task('admin', function adminPagesTask() {
  return app.src('admin/**/*.{html,yml}')
    .pipe(app.dest('dist/admin'))
    .pipe(browserSync.stream());
});

app.task('serve', function () {
  browserSync.init({
    port: 8080,
    startPath: 'index.html',
    server: {
      baseDir: 'dist'
    }
  });
});

app.task('watch', function () {
  app.watch('templates/**/*.hbs', ['content']);
});

app.task('deploy', ['admin', 'content']);

// build site, serve then watch for edits
app.task('default', ['content'], app.parallel(['serve', 'watch']));

module.exports = app;
