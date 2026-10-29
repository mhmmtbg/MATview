function varargout = demoGUI(varargin)
% DEMOGUI  GUIDE tarzı örnek arayüz (test için)
gui_Singleton = 1;
gui_State = struct('gui_Name',       mfilename, ...
                   'gui_Singleton',  gui_Singleton, ...
                   'gui_OpeningFcn', @demoGUI_OpeningFcn, ...
                   'gui_OutputFcn',  @demoGUI_OutputFcn, ...
                   'gui_LayoutFcn',  [] , ...
                   'gui_Callback',   []);
if nargin && ischar(varargin{1})
    gui_State.gui_Callback = str2func(varargin{1});
end

if nargout
    [varargout{1:nargout}] = gui_mainfcn(gui_State, varargin{:});
else
    gui_mainfcn(gui_State, varargin{:});
end
% End initialization code - DO NOT EDIT


% --- Executes just before demoGUI is made visible.
function demoGUI_OpeningFcn(hObject, eventdata, handles, varargin)
handles.output = hObject;
handles.sayac = 0;
guidata(hObject, handles);


function varargout = demoGUI_OutputFcn(hObject, eventdata, handles)
varargout{1} = handles.output;


% --- Executes on button press in pushbutton1.
function pushbutton1_Callback(hObject, eventdata, handles)
handles.sayac = handles.sayac + 1;
set(handles.text1, 'String', sprintf('Tiklama: %d', handles.sayac));
v = get(handles.popupmenu1, 'Value');
s = get(handles.popupmenu1, 'String');
axes(handles.axes1);
plot(1:10, (1:10)*v);
title(s{v});
guidata(hObject, handles);


function popupmenu1_Callback(hObject, eventdata, handles)
handles.edit1.String = num2str(hObject.Value);


function popupmenu1_CreateFcn(hObject, eventdata, handles)
if ispc && isequal(get(hObject,'BackgroundColor'), get(0,'defaultUicontrolBackgroundColor'))
    set(hObject,'BackgroundColor','white');
end


function pushbutton2_Callback(hObject, eventdata, handles)
[f, p] = uigetfile('*.bin', 'Binary seçin');
if isequal(f, 0), return; end
fid = fopen(fullfile(p, f), 'r');
d = fread(fid, inf, 'uint8=>uint8');
fclose(fid);
set(handles.text1, 'String', sprintf('%s: %d bayt, ilk %d', f, numel(d), d(1)));
assignin('base', 'veri', d);
