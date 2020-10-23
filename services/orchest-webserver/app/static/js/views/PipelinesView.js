import React, { Fragment } from 'react';

import PipelineView from "./PipelineView";
import MDCIconButtonToggleReact from "../lib/mdc-components/MDCIconButtonToggleReact";
import { makeRequest, makeCancelable, PromiseManager, RefManager } from '../lib/utils/all';
import MDCButtonReact from '../lib/mdc-components/MDCButtonReact';
import MDCTextFieldReact from '../lib/mdc-components/MDCTextFieldReact';
import MDCLinearProgressReact from '../lib/mdc-components/MDCLinearProgressReact';
import MDCDialogReact from '../lib/mdc-components/MDCDialogReact';
import MDCDataTableReact from '../lib/mdc-components/MDCDataTableReact';
import SessionToggleButton from '../components/SessionToggleButton';


class PipelinesView extends React.Component {

    componentWillUnmount() {

    }

    constructor(props) {
        super(props);


        this.state = {
            loaded: false,
            createModal: false,
        }

        this.promiseManager = new PromiseManager();
        this.refManager = new RefManager();
    }

    componentWillUnmount(){
        this.promiseManager.cancelCancelablePromises();
    }

    componentDidMount() {

        this.fetchList();

        // set headerbar
        orchest.headerBarComponent.setPipeline(undefined);
    }

    processListData(pipelines){

        let listData = [];

        for(let pipeline of pipelines){
            listData.push([
                <span>{pipeline.name}</span>,
                <span>{pipeline.path}</span>,
                <SessionToggleButton classNames={["consume-click"]} pipeline_uuid={pipeline.uuid} />
            ]);
        }

        return listData
    }

    fetchList(){
        // initialize REST call for pipelines
        let fetchListPromise = makeCancelable(makeRequest("GET", `/async/pipelines/${this.props.project_uuid}`), this.promiseManager);
        
        fetchListPromise.promise.then((response) => {
            let data = JSON.parse(response);            
            this.setState({loaded: true, listData: this.processListData(data.result), pipelines: data.result})
            this.refManager.refs.pipelineListView.setSelectedRowIds([]);
        });
    }

    onClickListItem(row, idx, e) {

        let pipeline = this.state.pipelines[idx];
        
        // load pipeline view
        let props = {
            "pipeline_uuid": pipeline.uuid,
            "project_uuid": this.props.project_uuid
        }

        if(e.ctrlKey || e.metaKey){
            props.readOnly = true;
        }

        orchest.loadView(PipelineView, props);

    }

    onDeleteClick(){

        let selectedIndices = this.refManager.refs.pipelineListView.getSelectedRowIndices();
        
        if(selectedIndices.length === 0){
            orchest.alert("Error", "You haven't selected a pipeline.")
            return;
        }

        orchest.confirm("Warning", "Are you certain that you want to delete this pipeline? (This cannot be undone.)", () => {

            selectedIndices.forEach((index) => {
                let pipeline_uuid = this.state.pipelines[index].uuid;

                makeRequest("GET", `/api-proxy/api/sessions/${this.props.project_uuid}/${this.props.pipeline_uuid}`).then((response) => {
                    let data = JSON.parse(response);
                    if(data["sessions"].length > 0){
                        makeRequest("DELETE", `/api-proxy/api/sessions/${this.props.project_uuid}/${this.props.pipeline_uuid}`);
                    }
                })

                makeRequest("POST", `/api-proxy/api/sessions/${this.props.project_uuid}/${this.props.pipeline_uuid}`).then((_) => {
                    
                    // reload list once removal succeeds
                    this.fetchList();
                })
            });
        })
    }

    onCreateClick(){
        this.setState({
            createModal: true
        })

        this.refManager.refs.createPipelineNameTextField.focus();
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
    }

    onSubmitModal(){
        let pipelineName = this.refManager.refs.createPipelineNameTextField.mdc.value;
        let pipelinePath = this.refManager.refs.createPipelinePathField.mdc.value;

        if(!pipelineName){
            orchest.alert("Error", "Please enter a name.")
            return;
        }

        if(!pipelinePath){
            orchest.alert("Error", "Please enter the path for the pipeline.")
            return;
        }

        if(!pipelinePath.endsWith(".orchest")){
            orchest.alert("Error", "The path should end in the .orchest extension.")
            return;
        }

        makeRequest("POST", "/async/pipelines/create", {
            type: "json",
            content: {
                "name": pipelineName,
                "project_uuid": this.props.project_uuid,
                "pipeline_path": pipelinePath
            }
        }).then((_) => {
            // reload list once creation succeeds
            this.fetchList()
        })

        this.setState({
            createModal: false
        })
    }

    onCancelModal(){
        this.setState({
            createModal: false
        })
    }

    render() {
        if(this.state.loaded){
            return <div className={"view-page pipelines-view"}>

            {(() => {
                if(this.state.createModal){
                    return <MDCDialogReact title="Create a new pipeline" 
                        content={
                            <Fragment>
                                <MDCTextFieldReact ref={this.refManager.nrefs.createPipelineNameTextField} classNames={['fullwidth']} label="Pipeline name" />
                                <MDCTextFieldReact ref={this.refManager.nrefs.createPipelinePathField} classNames={['fullwidth']} label="Pipeline path" value="pipeline.orchest" />
                            </Fragment>
                    } actions={
                        <Fragment>
                            <MDCButtonReact icon="device_hub" classNames={["mdc-button--raised", "themed-secondary"]} label="Create pipeline" onClick={this.onSubmitModal.bind(this)} />                            
                            <MDCButtonReact icon="close" label="Cancel" classNames={["push-left"]} onClick={this.onCancelModal.bind(this)} />
                        </Fragment>
                    } />
                }
            })() }

                <h2>Pipelines</h2>
                <div className={"pipeline-actions push-down"}>
                    <MDCIconButtonToggleReact icon="add" onClick={this.onCreateClick.bind(this)} />
                    <MDCIconButtonToggleReact icon="delete" onClick={this.onDeleteClick.bind(this)} />
                </div>

                <MDCDataTableReact ref={this.refManager.nrefs.pipelineListView} selectable onRowClick={this.onClickListItem.bind(this)} classNames={['fullwidth']} headers={["Pipeline", "Path","Session"]} rows={this.state.listData}  />
                
            </div>;
        }else{
            return <div className={"view-page"}>
                <h2>Pipelines</h2>
                <MDCLinearProgressReact />
            </div>;
        }

    }
}

export default PipelinesView;