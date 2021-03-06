import React, { Component, PropTypes } from 'react';
import SplitPane from 'react-split-pane';
import { Menu, MenuItem, Tooltip, Icon, Button } from 'react-mdl';
import { Snackbar } from 'react-mdl';
import AceEditor from 'react-ace';
import brace from 'brace';
import classNames from 'classnames';
import Markdown from 'react-remarkable';
import Frame from 'react-frame-component';
import CopyToClipboard from 'react-copy-to-clipboard';
import hljs from 'highlight.js';

import 'react-resizable/css/styles.css';
import 'highlight.js/styles/default.css';
import 'highlight.js/styles/github.css';
import './mainarea.scss';

import 'brace/mode/html';
import 'brace/mode/css';
import 'brace/theme/github';

import Parser from '../../lib/parser.js';
import * as compiler from '../../lib/compiler.js';
import normalize from '../../lib/normalize.js';
import extend from '../../lib/extend.js';

const option = {
  html: false,        // Enable HTML tags in source
  xhtmlOut: false,        // Use '/' to close single tags (<br />)
  breaks: false,        // Convert '\n' in paragraphs into <br>
  langPrefix: 'language-',  // CSS language prefix for fenced blocks
  linkify: true,         // autoconvert URL-like texts to links
  linkTarget: '',           // set target to open link in

  // Enable some language-neutral replacements + quotes beautification
  typographer: false,

  // Double + single quotes replacement pairs, when typographer enabled,
  // and smartquotes on. Set doubles to '«»' for Russian, '„“' for German.
  quotes: '“”‘’',

  // Highlighter function. Should return escaped HTML,
  // or '' if input not changed
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(lang, str).value;
      } catch (__) { }
    }

    try {
      return hljs.highlightAuto(str).value;
    } catch (__) { }

    return ''; // use external default escaping
  }
}

export default class MainArea extends React.Component {

  constructor() {
    super();
    this.state = {
      editMode: "preview",
      hasPreview: false,
      hasNote: false,
      isRemoveDialogOpen: false,
      isEditDialogOpen: false,
      isSnackbarActive: false,
      isCopiedSnackbarActive: false,
      expanded: false,
      paneSize:800,
      timestamp: (+new Date).toString(36)
    };
  }

  changeMode(mode) {
    this.setState({
      editMode: mode
    });
  }

  componentWillReceiveProps(props) {
    if (props.config && props.config.parser) {
      const parser = new Parser(props.config.parser);
      this.parser = parser;
    }
  }

  getComponent() {
    const itemId = this.props.itemId;
    const components = this.props.components;
    let comp = null;
    if (itemId && components) {
      for (let i = 0, n = components.length; i < n; i++) {
        if (components[i].itemId === itemId) {
          comp = components[i];
        }
      }
    }
    return comp;
  }

  getComponentIndex() {
    const itemId = this.props.itemId;
    const components = this.props.components;
    let index = -1;
    if (itemId && components) {
      for (let i = 0, n = components.length; i < n; i++) {
        if (components[i].itemId === itemId) {
          index = i;
        }
      }
    }
    return index;   
  }

  isParsable() {
    const component = this.getComponent();
    if (!component || !this.parser) {
      return false;
    }
    return true;
  }

  getDescription() {
    if (!this.isParsable()) {
      return;
    }
    const component = this.getComponent();
    const doc = this.parser.getDoc(component.html);
    const desc = this.parser.getMark("desc", doc);
    return desc;
  }

  getNote() {
    if (!this.isParsable()) {
      return;
    }
    const component = this.getComponent();
    const note = this.parser.getNote(component.html);
    return note;
  }

  isGreaterThan(text) {
    const component = this.getComponent();
    const cat = component.category;
    if (material[cat] > material[text]) {
      return true;
    } else {
      return false;
    }
  }

  openEditDialog() {
    this.setState({
      isEditDialogOpen:true
    })
  }

  closeEditDialog() {
    this.setState({
      isEditDialogOpen:false
    });
  }

  getPreview() {
    if (!this.isParsable()) {
      return;
    }
    const config = this.props.config;
    const itemId = this.props.itemId;
    const parser = this.parser;
    const component = this.getComponent();
    const text = component.html;
    const components = this.props.components;

    let preview = parser.getPreview(text);

    if(!preview) {
      return '';
    }

    preview = compiler[`${config.markup}Render`](preview);

    while (1) {
      const comment = parser.getTag(preview, components);

      if (!comment) {
        break;
      }

      const name = parser.getComponentName(comment);
      let flag = false;
      for (let i = 0, n = components.length; i < n; i++) {
        const comp = components[i];
        if (name === comp.name) {
          flag = true;
          const template = parser.getTemplate(comp.html);
          let html = parser.getInnerHtmlFromTemplate(template);
          html = parser.removeSelf(html, comp.name);
          const defs = parser.getVarsFromTemplate(template);
          const overrides = parser.getVars(comment);
          const vars = extend({}, defs, overrides);
          html = parser.include2Tag(html, comp.path, components, config.markup);
          html = compiler[`${config.markup}Render`](html,vars);
          preview = preview.replace(comment, html);
          preview = parser.getRendered(preview, defs, overrides);
          break;
        }
      }
      if (!flag) {
        preview = preview.replace(comment, "");
      }
    }
    if(config.run_script){
      return preview;
    }else{
      return parser.removeScript(preview);
    }
  }

  appendLinksToCustom(preview) {
    const config = this.props.config;
    const stamp = this.state.timestamp;
    const css_dependencies = config.css_dependencies;

    if(css_dependencies) {
      css_dependencies.forEach((item) => {
        preview += `<link rel="stylesheet" href="${item}?v=${stamp}" />`
      })
    }
    return preview;
  }

  openRemoveDialog() {
    this.setState({
      isRemoveDialogOpen:true
    })
  }

  removeItem() {
    const index = this.getComponentIndex();
    this.props.removeComponent(index);
  }

  aceOnload(editor) {
    editor.commands.addCommand({
      name: "save",
      bindKey: {
        win: "Ctrl+S",
        mac: "Command-S"
      },
      exec: () => {
        const value = editor.getSession().getValue();
        const currentItem = this.getComponent();
        const mode = this.state.editMode;
        const component = Object.assign({},currentItem,{[mode]:value});
        const index = this.getComponentIndex();
        this.props.updateComponent(index,component);
        this.setState({
          isSnackbarActive:true
        })
      }
    });
    editor.commands.on("exec", function(e) {
      if (e.command && (e.command.name == "reload" || e.command.name == "save")) {
        e.preventDefault();
        e.command.exec();
      }
    });
  }

  updateComponent(obj) {
    const currentItem = this.getComponent();
    const index = this.getComponentIndex();
    const component = Object.assign({},currentItem,obj);
    this.props.updateComponent(index,component);
  }

  hideSnackbar(){
    this.setState({
      isSnackbarActive:false
    });
  }

  hideCopiedSnackbar(){
    this.setState({
      isCopiedSnackbarActive:false
    });
  }

  onResized(size) {
    this.setState({
      paneSize:size
    });
  }

  expandPreview() {
    const expanded = this.state.expanded;
    if(expanded === true) {
      this.setState({
        expanded:false,
        paneSize:800
      });
    } else {
      this.setState({
        expanded:true
      });
    }
  }

  render() {
    const state = this.state;
    const editMode = state.editMode;
    const hasPreview = state.hasPreview;
    const component = this.getComponent();
    const index = this.getComponentIndex();
    const description = this.getDescription();
    const note = this.getNote();
    const preview = this.getPreview();
    const source = preview ? preview.replace(/^([\t ])*\n/gm,"") : '';
    const html = this.appendLinksToCustom(preview);
    const snippets = `\`\`\`html\n${source}\`\`\``;
    const props = this.props;
    const enable_editing = props.config && props.config.enable_editing;
    const isEditDialogOpen = state.isEditDialogOpen;
    const paneSize = state.paneSize;
    const lang =props.config && props.config.lang ? props.config.lang : 'ja';
    const expanded = state.expanded;
    const pc = props.config && props.config.breakpoint && props.config.breakpoint.pc ? props.config.breakpoint.pc : 1024;
    const tablet = props.config && props.config.breakpoint && props.config.breakpoint.tablet ? props.config.breakpoint.tablet : 768;
    const smartphone = props.config && props.config.breakpoint && props.config.breakpoint.smartphone ? props.config.breakpoint.smartphone : 768;
    const markup = props.config && props.config.markup ? props.config.markup : 'HTML';
    const styling = props.config && props.config.styling ? props.config.styling : 'CSS';

    return (
      <main className="atomicLabMain">
        <div className="atomicLabTabs mdl-tabs mdl-js-tabs">
          <div className="atomicLabComponentControl mdl-shadow--2dp">
            {component && 
              <div className="atomicLabComponentControl-icon-wrap">
                <div className={classNames("atomicLabComponentControl-icon",component.category)}></div>
              </div>}
            <div className="atomicLabComponentControl-texts">
              <div className="atomicLabComponentControl-title">
                {component &&
                  <span>{component.name}</span>
                }
              </div>
              <p className="atomicLabComponentControl-description">
                {description}
              </p>
            </div>
            <div className="atomicLabTabs-bar mdl-tabs__tab-bar">
              <a className={classNames("atomicLabTabs-tab", "mdl-layout__tab", { "is-active": editMode === "preview" })} onClick={this.changeMode.bind(this, 'preview')}>Preview</a>
              {note &&
                <a className={classNames("atomicLabTabs-tab", "mdl-layout__tab", { "is-active": editMode === "note" })} onClick={this.changeMode.bind(this, 'note')}>Note</a>
              }
              {component && component.css &&
                <a className={classNames("atomicLabTabs-tab", "mdl-layout__tab", { "is-active": editMode === "css" })} onClick={this.changeMode.bind(this, 'css')}>{styling}</a>
              }
              <a className={classNames("atomicLabTabs-tab", "mdl-layout__tab", { "is-active": editMode === "info" })} onClick={this.changeMode.bind(this, 'info')}>Info</a>
              <a className={classNames("atomicLabTabs-tab", "mdl-layout__tab", { "is-active": editMode === "html" })} onClick={this.changeMode.bind(this, 'html')}>{markup}</a>
            </div>
          </div>
          {editMode === 'css' &&
            <div className="atomicLabTabs-panel mdl-tabs__panel is-active">
              {component && component.css &&
                <div className="atomicLabPreview">
                  <div className="atomicLabCard mdl-card mdl-shadow--2dp">
                    <div className="atomicLabCard-title">
                      <i className="material-icons">insert_drive_file</i> 
                        CSS
                        <CopyToClipboard text={component.css} onCopy={()=>{this.setState({isCopiedSnackbarActive:true})}}>
                          <Button primary style={{float:'right'}}>Copy to clipboard</Button>
                        </CopyToClipboard>
                    </div>
                    <div className="atomicLabNote">
                      <Markdown source={`\`\`\`css\n${component.css}\n\`\`\`\``} options={option} />
                    </div>
                  </div>
                </div>                
              }
            </div>
          }
          {editMode === 'html' &&
            <div className="atomicLabTabs-panel mdl-tabs__panel is-active">
              {component &&
                <AceEditor value={component.html} mode='html' theme="monokai"
                  setOptions={{
                    enableBasicAutocompletion: true,
                    enableSnippets: true,
                    enableLiveAutocompletion: true
                  }} onLoad={this.aceOnload.bind(this)}/>
              }
            </div>
          }
          {editMode === 'preview' &&
            <div className="atomicLabTabs-panel mdl-tabs__panel is-active">
              <div className="atomicLabPreview">
                {preview &&
                  <div className={classNames('atomicLabCard','mdl-card','mdl-shadow--2dp',{'atomicLabCardExpanded':expanded})}>
                    <div className="atomicLabCardInner">
                      <div style={{float:'right', cursor:'pointer'}}>
                        <Icon name="open_with" onClick={this.expandPreview.bind(this)}/>
                      </div>
                      <div className="atomicLabCard-title">
                        Preview 
                        <span className="atomicLabCard-screenSize">{paneSize}px</span>
                        <Icon name="icon_smartphone" style={{cursor:'pointer'}} onClick={this.onResized.bind(this,smartphone)}/>
                        <Icon name="icon_tablet_mac" style={{cursor:'pointer'}} onClick={this.onResized.bind(this,tablet)}/>
                        <Icon name="icon_laptop" style={{cursor:'pointer'}} onClick={this.onResized.bind(this,pc)}/>
                      </div>
                      <div className="atomicLabPaneWrap">
                        <SplitPane split="vertical" minSize={320} defaultSize={paneSize + 22} size={paneSize + 22} onChange={this.onResized.bind(this)} >
                          <div className="atomicLabIframeContainer">
                            <div className="atomicLabShadowContainer">
                              <Frame style={{width:'100%',height:'100%',border:'none'}}>
                                  <div dangerouslySetInnerHTML={{__html: html}}>
                                  </div>
                              </Frame>
                            </div>
                          </div>
                          <div></div>
                        </SplitPane>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
          {editMode === 'info' &&
            <div className="atomicLabTabs-panel mdl-tabs__panel is-active">
              {component &&
                <div className="atomicLabCard mdl-card mdl-shadow--2dp">
                  <div className="atomicLabCard-title">Path</div>
                  <div className="atomicLabNote"><pre>{component.path}</pre></div>
                </div>
              }
              <div className="atomicLabPreview">
                <div className="atomicLabCard mdl-card mdl-shadow--2dp">
                  <div className="atomicLabCard-title">
                    <i className="material-icons">insert_drive_file</i> 
                    Snippets
                    <CopyToClipboard text={source} onCopy={()=>{this.setState({isCopiedSnackbarActive:true})}}>
                      <Button primary style={{float:'right'}}>Copy to clipboard</Button>
                    </CopyToClipboard>
                  </div>
                  
                  <div className="atomicLabNote">
                    <Markdown source={snippets} options={option} />
                  </div>
                </div>
              </div>
            </div>
          }
          {editMode === 'note' && note &&
            <div className="atomicLabCard mdl-card mdl-shadow--2dp">
              <div className="atomicLabCard-title"><i className="material-icons">insert_drive_file</i> Note</div>
              <div className="atomicLabNote"><Markdown source={note} options={option} /></div>
            </div>
          }
        </div>
        <Snackbar
          active={state.isSnackbarActive}
          onTimeout={this.hideSnackbar.bind(this)}
          onClick={this.hideSnackbar.bind(this)} timeout={2000}>Saved.</Snackbar>
        <Snackbar
          active={state.isCopiedSnackbarActive}
          onTimeout={this.hideCopiedSnackbar.bind(this)}
          onClick={this.hideCopiedSnackbar.bind(this)} timeout={2000}
        >Copied.
        </Snackbar>
      </main>
    );
  }
}
